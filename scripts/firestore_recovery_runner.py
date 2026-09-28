"""Fail-closed recovery gate using per-run reports and owned process containers.

Windows workers enter a kill-on-close Job Object before launching any tools.
POSIX workers enter separate process groups. No global Java/Gradle process kill.
"""
import ctypes
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
TEST_CLASS = "com.aus.ausgegeben.data.FirestoreEmulatorRecoveryTest"
TESTS = (
    "int1_serverSuccessWithAmbiguousOutcome_recoversExactlyOneRemoteRecord",
    "int2_ambiguousA_thenExplicitB_yieldsExactlyTwoRemoteRecords",
    "int3_retryWithSameOperationId_commitsExactlyOneRemoteDocument",
    "int4_recoveryFromReconstructedProductionGraph_usesServerWithEmptyCache",
    "int5_lateCompletionOfA_removesOnlyA_andBReconcilesIndependently",
    "int6_signOutClearsPendingOperations_nextAccountCannotReconcileThem",
)
REPORT = f"TEST-{TEST_CLASS}.xml"
# SDK, CLI hub/logging, and Firestore websocket ports.
PORTS = (8080, 9099, 4400, 4500, 9150)


def validate_report(path, expected=TESTS):
    """Gradle emits one testsuite root, with direct testcase children."""
    suite = ET.parse(path).getroot()
    if suite.tag != "testsuite" or suite.get("name") != TEST_CLASS:
        raise ValueError("Unexpected JUnit suite")
    cases = suite.findall("testcase")
    identities = [(case.get("classname"), case.get("name")) for case in cases]
    wanted = [(TEST_CLASS, name) for name in expected]
    if sorted(identities, key=str) != sorted(wanted):
        raise ValueError(f"Expected exact testcase identities: {wanted}; got {identities}")
    if len(list(suite.iter("testcase"))) != len(cases):
        raise ValueError("Nested testcase elements are not Gradle's report format")
    if any(list(suite.iter(tag)) for tag in ("failure", "error", "skipped")):
        raise ValueError("Failure/error/skip child in report")
    if len(list(suite.iter("testsuite"))) != 1:
        raise ValueError("Nested suite in report")
    for key, count in {"tests": len(cases), "failures": 0, "errors": 0, "skipped": 0}.items():
        if suite.get(key) != str(count):
            raise ValueError(f"Inconsistent {key} counter: {suite.get(key)!r}, expected {count}")


class WindowsJob:
    """Stdlib binding to documented Windows Job Object APIs."""
    def __init__(self):
        from ctypes import wintypes as w

        class BasicLimits(ctypes.Structure):
            _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                        ("flags", w.DWORD), ("min_working_set", ctypes.c_size_t),
                        ("max_working_set", ctypes.c_size_t), ("active_limit", w.DWORD),
                        ("affinity", ctypes.c_size_t), ("priority", w.DWORD),
                        ("scheduling", w.DWORD)]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [("basic", BasicLimits), ("io", ctypes.c_ulonglong * 6),
                        ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                        ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]

        class Accounting(ctypes.Structure):
            _fields_ = [("times", ctypes.c_longlong * 4), ("faults", w.DWORD),
                        ("total", w.DWORD), ("active", w.DWORD), ("terminated", w.DWORD)]

        self.accounting = Accounting
        self.api = ctypes.WinDLL("kernel32", use_last_error=True)
        for name, args, result in (
            ("CreateJobObjectW", [ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
            ("SetInformationJobObject", [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
            ("AssignProcessToJobObject", [w.HANDLE, w.HANDLE], w.BOOL),
            ("QueryInformationJobObject", [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
            ("TerminateJobObject", [w.HANDLE, w.UINT], w.BOOL),
            ("CloseHandle", [w.HANDLE], w.BOOL),
        ):
            fn = getattr(self.api, name)
            fn.argtypes, fn.restype = args, result
        self.handle = self.api.CreateJobObjectW(None, None)
        self.check(self.handle)
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # KILL_ON_JOB_CLOSE; no breakaway permitted.
        try:
            self.check(self.api.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)))
        except BaseException:
            self.close()
            raise

    @staticmethod
    def check(value):
        if not value:
            raise ctypes.WinError(ctypes.get_last_error())

    def assign(self, process):
        self.check(self.api.AssignProcessToJobObject(self.handle, int(process._handle)))

    def active(self):
        info = self.accounting()
        self.check(self.api.QueryInformationJobObject(self.handle, 1, ctypes.byref(info), ctypes.sizeof(info), None))
        return info.active

    def terminate(self):
        self.check(self.api.TerminateJobObject(self.handle, 1))

    def close(self):
        self.check(self.api.CloseHandle(self.handle))


class OwnedProcess:
    def __init__(self, command, env, cwd=ROOT):
        self.job = WindowsJob() if os.name == "nt" else None
        self.process = None
        try:
            self.process = subprocess.Popen(
                [sys.executable, str(Path(__file__).resolve()), "--owned-worker", json.dumps(command)],
                cwd=cwd, env=env, stdin=subprocess.PIPE,
                start_new_session=os.name != "nt",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            if self.job:
                self.job.assign(self.process)
            # No descendants exist until this byte. Assignment failure fails
            # closed without ever launching Firebase or Gradle.
            self.process.stdin.write(b"G")
            self.process.stdin.close()
        except BaseException:
            if self.process:
                self.process.kill()
                self.process.wait()
            if self.job:
                self.job.close()
            raise

    def poll(self):
        return self.process.poll()

    def active(self):
        if self.job:
            return self.job.active() > 0
        try:
            os.killpg(self.process.pid, 0)
            return True
        except ProcessLookupError:
            return False

    def stop(self):
        # Retain ownership even when the original parent has already exited.
        if self.job:
            self.job.terminate()
        else:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 10
        while self.active() and time.monotonic() < deadline:
            self.process.poll()
            time.sleep(0.05)
        if self.active() and not self.job:
            os.killpg(self.process.pid, signal.SIGKILL)
        self.process.wait(timeout=10)
        deadline = time.monotonic() + 10
        while self.active() and time.monotonic() < deadline:
            time.sleep(0.05)
        if self.active():
            raise RuntimeError(f"Owned process tree {self.process.pid} did not exit")
        if self.job:
            self.job.close()
        print(f"Owned tree {self.process.pid}: empty", flush=True)


def worker(command):
    if sys.stdin.buffer.read(1) != b"G":
        return 1
    return subprocess.call(command, stdin=subprocess.DEVNULL)


def port_open(port):
    with socket.socket() as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def emulators_ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:4400/emulators", timeout=0.5) as response:
            info = json.load(response)
        return all(info.get(name, {}).get("port") == port and port_open(port)
                   for name, port in (("auth", 9099), ("firestore", 8080)))
    except (OSError, ValueError):
        return False


def gradle_command(arguments):
    return [str(ROOT / ("gradlew.bat" if os.name == "nt" else "gradlew")), *arguments]


def gradle_environment(environment):
    environment = dict(environment)
    # Gradle's native ProcessEnvironment otherwise calls setsid() even for a
    # single-use --no-daemon JVM, escaping our process group. Its Java fallback
    # keeps that JVM and its workers in the owned group. Native services initialize
    # BEFORE Gradle parses CLI -D options. The daemon initializes them separately,
    # so JAVA_TOOL_OPTIONS must reach BOTH launcher and daemon JVM startup.
    if os.name != "nt":
        environment["JAVA_TOOL_OPTIONS"] = environment.get("JAVA_TOOL_OPTIONS", "") + " -Dorg.gradle.native=false"
    return environment


def run(*, expected=TESTS, gradle_extra=(), timeout=900):
    """Canonical CLI always uses all six tests. The Python acceptance tooling
    can exercise individual tests or inject a test-only Gradle init script.
    """
    result_root = ROOT / "app/build/recovery-runs"
    result_root.mkdir(parents=True, exist_ok=True)
    run_dir = Path(tempfile.mkdtemp(prefix="run-", dir=result_root))
    report_dir = run_dir / "xml"
    report_dir.mkdir()
    # Exclusive new directory = freshness token; no timestamp comparison.
    init = run_dir / "reports.gradle"
    init.write_text(
        "gradle.projectsEvaluated { rootProject.allprojects { tasks.withType(Test).configureEach { "
        "if (name == 'testProdDebugUnitTest') { "
        "reports.junitXml.outputLocation.set(file(System.getenv('RECOVERY_RESULT_DIR'))) "
        "} } } }\n", encoding="utf-8")
    env = dict(os.environ, RECOVERY_INTEGRATION_REQUIRED="true", RECOVERY_RESULT_DIR=str(report_dir))
    owned = []
    interrupted = 0
    previous_handlers = {}
    status = 1
    started = time.monotonic()

    def receive(signum, _frame):
        nonlocal interrupted
        interrupted = signum  # Cleanup is not reentered by a second signal.

    def check():
        if interrupted:
            raise RuntimeError(f"Interrupted by signal {interrupted}")
        if time.monotonic() - started > timeout:
            raise TimeoutError(f"Recovery run exceeded {timeout}s")

    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[sig] = signal.signal(sig, receive)
        print(f"Recovery run: {run_dir}", flush=True)
        occupied = [port for port in PORTS if port_open(port)]
        if occupied:
            raise RuntimeError(f"Emulator ports already occupied: {occupied}")
        cli = ROOT / "web/node_modules/firebase-tools/lib/bin/firebase.js"
        firebase = OwnedProcess([shutil.which("node") or "node", str(cli), "emulators:start",
                                 "--only", "firestore,auth", "--project", "demo-ausgegeben"], env)
        owned.append(firebase)
        while not emulators_ready():
            check()
            if firebase.poll() is not None:
                raise RuntimeError(f"Firebase exited before readiness: {firebase.poll()}")
            if time.monotonic() - started > 120:
                raise TimeoutError("Emulators did not become ready within 120s")
            time.sleep(0.1)
        arguments = ["testProdDebugUnitTest"]
        for name in expected:
            arguments += ["--tests", f"{TEST_CLASS}.{name}"]
        arguments += ["--rerun", "--no-daemon", "--no-build-cache", "-I", str(init), *gradle_extra]
        if "RECOVERY_TEST_INIT_SCRIPT" in os.environ:
            arguments += ["--no-configuration-cache", "-I", os.environ["RECOVERY_TEST_INIT_SCRIPT"]]
        gradle = OwnedProcess(gradle_command(arguments), gradle_environment(env))
        owned.append(gradle)
        (run_dir / "processes.json").write_text(json.dumps({"supervisor": os.getpid(),
            "firebase": firebase.process.pid, "gradle": gradle.process.pid}), encoding="utf-8")
        while gradle.poll() is None:
            check()
            if firebase.poll() is not None:
                raise RuntimeError(f"Firebase exited before Gradle completed: {firebase.poll()}")
            time.sleep(0.1)
        check()
        if gradle.poll() != 0:
            raise RuntimeError(f"Current Gradle invocation exited {gradle.poll()}")
        if firebase.poll() is not None:
            raise RuntimeError("Firebase exited before result certification")
        (run_dir / "gradle-completed.json").write_text(json.dumps({"run": run_dir.name,
            "gradle_pid": gradle.process.pid, "exit": gradle.poll()}), encoding="utf-8")
        validate_report(report_dir / REPORT, expected)
        status = 0
    except (Exception, KeyboardInterrupt) as error:
        print(f"Recovery integration suite: FAIL: {error}", file=sys.stderr, flush=True)
    finally:
        for process in reversed(owned):
            try:
                process.stop()
            except Exception as error:
                status = 1
                print(f"Cleanup FAILED: {error}", file=sys.stderr, flush=True)
        if owned:
            deadline = time.monotonic() + 10
            while any(port_open(port) for port in PORTS) and time.monotonic() < deadline:
                time.sleep(0.1)
            if any(port_open(port) for port in PORTS):
                status = 1
                print("Cleanup FAILED: emulator listener remains", file=sys.stderr, flush=True)
        if interrupted:
            status = 128 + interrupted
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
    if status == 0:
        print(f"Recovery integration suite: PASS ({len(expected)} executed, 0 skipped)", flush=True)
    return status


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--owned-worker":
        sys.exit(worker(json.loads(sys.argv[2])))
    if len(sys.argv) != 1:
        sys.exit("The canonical runner accepts no filters or gate overrides")
    sys.exit(run())
