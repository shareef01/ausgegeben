"""Dependency-free harness regressions: python scripts/test_firestore_recovery_runner.py.

Use --integration for real Firebase/Gradle acceptance (three canonical runs,
four individual scenarios, and deterministic interruption/failure injection).
Artifacts are isolated under app/build/recovery-acceptance, never source files.
"""
import copy
import ctypes
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
import firestore_recovery_runner as runner


def good_xml():
    suite = ET.Element("testsuite", name=runner.TEST_CLASS, tests="6", failures="0", errors="0", skipped="0")
    for name in runner.TESTS:
        ET.SubElement(suite, "testcase", name=name, classname=runner.TEST_CLASS)
    return ET.tostring(suite, encoding="unicode")


def xml_fixtures(good):
    root = ET.fromstring(good)
    fixtures = {
        "truncated final close": good[:good.rfind("</testsuite>")],
        "truncated inside testcase name": good[:good.index(runner.TESTS[5]) + 5],
        "unterminated attribute": good.replace('tests="6"', 'tests="6'),
        "unterminated element": good.replace("</testsuite>", "<unfinished>"),
        "missing XML": None,
    }
    def changed(name, change):
        item = copy.deepcopy(root)
        change(item)
        fixtures[name] = ET.tostring(item, encoding="unicode")
    def replace_cases(item, comment):
        cases = item.findall("testcase")
        text = "".join(ET.tostring(case, encoding="unicode") for case in cases)
        for case in cases:
            item.remove(case)
        if comment:
            item.append(ET.Comment(text))
        else:
            ET.SubElement(item, "system-out").text = text
    changed("names only in comments", lambda s: replace_cases(s, True))
    changed("names only in system-out", lambda s: replace_cases(s, False))
    changed("duplicate replacing testcase", lambda s: s.findall("testcase")[-1].set("name", s.findall("testcase")[0].get("name")))
    changed("tests counter mismatch", lambda s: s.set("tests", "5"))
    for tag, counter in (("failure", "failures"), ("error", "errors"), ("skipped", "skipped")):
        changed(f"{counter} counter lies", lambda s, tag=tag: ET.SubElement(s.find("testcase"), tag))
        changed(f"nonzero {counter} counter", lambda s, counter=counter: s.set(counter, "1"))
    changed("missing testcase", lambda s: s.remove(s.find("testcase")))
    changed("extra testcase", lambda s: ET.SubElement(s, "testcase", name="int7_extra", classname=runner.TEST_CLASS))
    changed("zero tests", lambda s: s.set("tests", "0"))
    changed("wrong suite", lambda s: s.set("name", "other"))
    changed("wrong classname", lambda s: s.find("testcase").set("classname", "other"))
    return fixtures


def alive(pid):
    if os.name == "nt":
        api = ctypes.WinDLL("kernel32", use_last_error=True)
        api.OpenProcess.restype = ctypes.c_void_p
        api.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        api.CloseHandle.argtypes = [ctypes.c_void_p]
        api.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        handle = api.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        code = ctypes.c_ulong()
        api.GetExitCodeProcess(handle, ctypes.byref(code))
        api.CloseHandle(handle)
        return code.value == 259
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def wait_for(condition, seconds=120):
    deadline = time.monotonic() + seconds
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("Synchronization deadline expired")
        time.sleep(0.05)


class ParserTests(unittest.TestCase):
    def test_fixtures(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.xml"
            path.write_text(good_xml(), encoding="utf-8")
            runner.validate_report(path)
            for name, xml in xml_fixtures(good_xml()).items():
                with self.subTest(name=name):
                    path.unlink(missing_ok=True)
                    if xml is not None:
                        path.write_text(xml, encoding="utf-8")
                    with self.assertRaises((ValueError, ET.ParseError, OSError)):
                        runner.validate_report(path)
                    print(f"XML REJECTED: {name}")

    def test_gate_exit_codes(self):
        # Exercise the supervisor's acceptance/exception path, not just parser
        # exceptions: the report-producing stand-in exits zero in every fixture.
        fixtures = {"complete report": good_xml(), **xml_fixtures(good_xml())}
        for name, xml in fixtures.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                driver = Path(directory) / "driver.py"
                write_report = ("from pathlib import Path; import os; "
                    "Path(os.environ['RECOVERY_RESULT_DIR']," + repr(runner.REPORT) + ").write_text(" + repr(xml) + ",encoding='utf-8')") if xml is not None else "pass"
                driver.write_text("import sys,os\nfrom pathlib import Path\nsys.dont_write_bytecode=True\n"
                    "sys.path.insert(0," + repr(str(Path(runner.__file__).parent)) + ")\n"
                    "import firestore_recovery_runner as r\nr.ROOT=Path(" + repr(directory) + ")\n"
                    "original=r.OwnedProcess\ncount=0\n"
                    "def owned(command,env):\n global count\n count+=1\n code='import time; time.sleep(300)' if count==1 else " + repr(write_report) + "\n return original([sys.executable,'-c',code],env,cwd=r.ROOT)\n"
                    "r.OwnedProcess=owned\nr.port_open=lambda port:False\nr.emulators_ready=lambda:True\n"
                    "sys.exit(r.run())\n", encoding="utf-8")
                result = subprocess.run([sys.executable, "-B", str(driver)], capture_output=True, text=True, timeout=45)
                expected = 0 if name == "complete report" else 1
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                self.assertEqual("Recovery integration suite: PASS" in result.stdout, expected == 0)
                self.assertNotIn("Cleanup FAILED", result.stdout + result.stderr)
                print(f"XML gate {name}: expected {expected}, actual {result.returncode}")


class OwnershipTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows kernel kill-on-close guarantee")
    def test_windows_supervisor_hard_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            marker = root / "pid"
            driver = root / "driver.py"
            driver.write_text("import sys,os,time\nsys.dont_write_bytecode=True\nsys.path.insert(0," + repr(str(Path(runner.__file__).parent)) + ")\n"
                "import firestore_recovery_runner as r\n"
                "p=r.OwnedProcess([sys.executable,'-c',\"import os,time; from pathlib import Path; Path(" + repr(str(marker)).replace('\\', '\\\\') + ").write_text(str(os.getpid())); time.sleep(300)\"],dict(os.environ))\n"
                "time.sleep(300)\n", encoding="utf-8")
            owner = subprocess.Popen([sys.executable, "-B", str(driver)])
            try:
                wait_for(marker.exists, 15)
                pid = int(marker.read_text())
                self.assertTrue(alive(pid))
            finally:
                owner.kill()
                owner.wait()
            wait_for(lambda: not alive(pid), 15)
            self.assertFalse(alive(pid))

    def test_descendants_after_parent_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "pid"
            script = "import subprocess,sys; from pathlib import Path; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(300)']); Path(sys.argv[1]).write_text(str(p.pid))"
            child = runner.OwnedProcess([sys.executable, "-c", script, str(marker)], dict(os.environ))
            try:
                wait_for(lambda: marker.exists() and child.poll() is not None, 15)
                descendant = int(marker.read_text())
                self.assertTrue(alive(descendant))
            finally:
                child.stop()
            self.assertFalse(alive(descendant))

    def test_supervisor_cancellation(self):
        # Real owned process trees, portable stand-ins for the external tools.
        # Real Firebase/Gradle interruption is separately exercised by --integration.
        modes = ["SIGINT", "SIGTERM", "timeout", "parent-zero"]
        if os.name != "nt":
            modes.extend(["outer-SIGINT", "outer-SIGTERM"])
        for mode in modes:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                fake = root / "tool.py"
                fake.write_text("import os,sys,time,subprocess,json,socket\nfrom pathlib import Path\n"
                    "role=sys.argv[1]; root=Path(sys.argv[2])\n"
                    "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(300)'])\n"
                    "sock=socket.socket(); sock.bind(('127.0.0.1',0)); sock.listen()\n"
                    "(root/(role+'.json')).write_text(json.dumps([os.getpid(),child.pid,sock.getsockname()[1]]))\n"
                    "while True:\n"
                    " if role=='firebase' and (root/'parent-zero').exists(): sys.exit(0)\n"
                    " time.sleep(.05)\n", encoding="utf-8")
                driver = root / "driver.py"
                driver.write_text("import sys,os,signal,threading,time\nfrom pathlib import Path\n"
                    "sys.dont_write_bytecode=True\nsys.path.insert(0," + repr(str(Path(runner.__file__).parent)) + ")\n"
                    "import firestore_recovery_runner as r\nr.ROOT=Path(" + repr(directory) + ")\n"
                    "original=r.OwnedProcess\ncount=0\n"
                    "def owned(command,env):\n global count\n count+=1\n return original([sys.executable," + repr(str(fake)) + ", 'firebase' if count==1 else 'gradle',str(r.ROOT)],env,cwd=r.ROOT)\n"
                    "r.OwnedProcess=owned\nr.port_open=lambda port:False\nr.emulators_ready=lambda:(r.ROOT/'firebase.json').exists()\n"
                    + ("def interrupt():\n while not (r.ROOT/'interrupt').exists(): time.sleep(.05)\n signal.raise_signal(signal." + mode + ")\nthreading.Thread(target=interrupt,daemon=True).start()\n" if os.name == "nt" and mode.startswith("SIG") else "")
                    + "sys.exit(r.run(timeout=" + ("2" if mode == "timeout" else "30") + "))\n", encoding="utf-8")
                with (root / "log").open("w") as log:
                    if mode.startswith("outer-"):
                        wrapper = root / "run.sh"
                        wrapper.write_text("#!/usr/bin/env bash\nset -euo pipefail\nexec " + repr(sys.executable) + " -B " + repr(str(driver)) + ' "$@"\n', encoding="utf-8")
                        wrapper.chmod(0o755)
                        cmd = ["bash", str(wrapper)]
                    else:
                        cmd = [sys.executable, "-B", str(driver)]
                    process = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
                    try:
                        wait_for(lambda: (root / "gradle.json").exists() or process.poll() is not None, 15)
                        self.assertIsNone(process.poll(), (root / "log").read_text())
                        states = [json.loads((root / f"{role}.json").read_text()) for role in ("firebase", "gradle")]
                        if mode.startswith("SIG"):
                            if os.name == "nt":
                                (root / "interrupt").touch()
                            else:
                                os.kill(process.pid, getattr(signal, mode))
                        elif mode.startswith("outer-"):
                            os.kill(process.pid, getattr(signal, mode[6:]))
                        elif mode == "parent-zero":
                            (root / "parent-zero").touch()
                        code = process.wait(timeout=45)
                    finally:
                        if process.poll() is None:
                            process.kill()
                            process.wait()
                text = (root / "log").read_text()
                expected_code = (128 + getattr(signal, mode[6:])) if mode.startswith("outer-") else None
                if expected_code:
                    self.assertEqual(code, expected_code, text)
                else:
                    self.assertNotEqual(code, 0, text)
                self.assertNotIn("Recovery integration suite: PASS", text)
                self.assertNotIn("Cleanup FAILED", text)
                for parent, child, port in states:
                    self.assertFalse(alive(parent), (mode, parent))
                    self.assertFalse(alive(child), (mode, child))
                    self.assertFalse(runner.port_open(port), (mode, port))
                print(f"Supervision PASS: {mode}; all owned PIDs/listeners gone")


def process_snapshot():
    if os.name == "nt":
        result = subprocess.check_output(["powershell", "-NoProfile", "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"], text=True)
        return {int(p["ProcessId"]): (int(p["ParentProcessId"]), p.get("CommandLine")) for p in json.loads(result)}
    result = subprocess.check_output(["ps", "-eo", "pid=,ppid=,args="], text=True)
    return {int(parts[0]): (int(parts[1]), parts[2]) for line in result.splitlines() if len(parts := line.split(None, 2)) == 3}


def descendants(roots, snapshot):
    owned = set(roots)
    while True:
        more = {pid for pid, (parent, _) in snapshot.items() if parent in owned}
        if more <= owned:
            return owned
        owned |= more


def integration():
    evidence_root = runner.ROOT / "app/build/recovery-acceptance"
    evidence_root.mkdir(parents=True, exist_ok=True)
    evidence = Path(tempfile.mkdtemp(prefix="acceptance-", dir=evidence_root))
    results = {}
    bash = shutil.which("bash") if os.name != "nt" else str(Path(os.environ["ProgramFiles"]) / "Git/bin/bash.exe")
    canonical = [bash, "scripts/run-firestore-recovery-tests.sh"]

    active_process = None

    def forward_signal(signum, _frame):
        nonlocal active_process
        if active_process and active_process.poll() is None:
            if os.name != "nt":
                try:
                    os.kill(active_process.pid, signum)
                except ProcessLookupError:
                    pass
            else:
                try:
                    active_process.terminate()
                except Exception:
                    pass
            try:
                active_process.wait(timeout=30)
            except Exception:
                pass
        sys.exit(128 + signum)

    prev_handlers = {sig: signal.signal(sig, forward_signal) for sig in (signal.SIGINT, signal.SIGTERM)}

    def execute(name, command=canonical, env=None, synchronize=None):
        nonlocal active_process
        log = evidence / f"{name}.log"
        with log.open("w", encoding="utf-8") as out:
            process = subprocess.Popen(command, cwd=runner.ROOT, env=env, stdout=out, stderr=subprocess.STDOUT)
            active_process = process
            try:
                if synchronize:
                    synchronize(process, log)
                code = process.wait(timeout=1000)
            finally:
                active_process = None
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=60)
        text = log.read_text(encoding="utf-8")
        matches = re.findall(r"^Recovery run: (.+)$", text, re.M)
        run_dir = Path(matches[0].strip()) if matches else None
        results[name] = {"exit": code, "pass": "Recovery integration suite: PASS" in text,
                         "run": str(run_dir), "log": str(log)}
        assert "Cleanup FAILED" not in text, text[-3000:]
        assert not any(runner.port_open(port) for port in runner.PORTS), "Surviving listener"
        print(name, results[name], flush=True)
        return code, text, run_dir

    for number in range(1, 4):
        code, text, run_dir = execute(f"canonical-{number}")
        assert code == 0 and "PASS (6 executed, 0 skipped)" in text
        runner.validate_report(run_dir / "xml" / runner.REPORT)
        if number == 1:
            good = (run_dir / "xml" / runner.REPORT).read_text(encoding="utf-8")
            (evidence / "genuine.xml").write_text(good, encoding="utf-8")
    # Exercise every malformed fixture derived from a genuine Gradle report.
    for name, xml in xml_fixtures(good).items():
        path = evidence / "invalid.xml"
        path.unlink(missing_ok=True)
        if xml is not None:
            path.write_text(xml, encoding="utf-8")
        try:
            runner.validate_report(path)
        except (OSError, ValueError, ET.ParseError):
            results[f"XML {name}"] = "REJECTED"
        else:
            raise AssertionError(f"Accepted {name}")

    for number in (1, 2, 4, 6):
        command = [sys.executable, "-B", "-c", "import sys; sys.path.insert(0,'scripts'); import firestore_recovery_runner as r; sys.exit(r.run(expected=(r.TESTS[%d],)))" % (number - 1)]
        code, text, _ = execute(f"individual-{number}", command)
        assert code == 0 and "PASS (1 executed, 0 skipped)" in text

    # Synchronize inside the real Gradle test task, before its test action. The
    # daemon publishes its PID then waits; no arbitrary sleep decides when to kill.
    gate = evidence / "gate.gradle"
    marker = evidence / "gradle-started"
    trigger = evidence / "interrupt"
    gate.write_text("allprojects { tasks.withType(Test).configureEach { if (name == 'testProdDebugUnitTest') { doFirst { "
        "new File(System.getenv('ACCEPTANCE_STARTED')).text = ProcessHandle.current().pid().toString(); "
        "while (true) { Thread.sleep(100) } } } } }", encoding="utf-8")
    preload = evidence / "interrupt.cjs"
    preload.write_text("const fs=require('node:fs'); if ((process.argv[1]||'').replace(/\\\\/g,'/').endsWith('/firebase-tools/lib/bin/firebase.js')) { "
        "const t=setInterval(()=>{if(fs.existsSync(process.env.ACCEPTANCE_TRIGGER)){clearInterval(t); "
        "console.error('ACCEPTANCE: invoking real Firebase SIGTERM handler'); process.emit('SIGTERM');}},50);t.unref();}", encoding="utf-8")
    previous_report = runner.ROOT / "app/build/test-results/testProdDebugUnitTest" / runner.REPORT
    saved = previous_report.read_bytes() if previous_report.exists() else None
    try:
        interruption_modes = ["stale-cli-interrupt", "no-report-cli-interrupt", "runner-SIGINT", "runner-SIGTERM"]
        if os.name != "nt":
            interruption_modes.extend(["outer-entrypoint-SIGINT", "outer-entrypoint-SIGTERM"])
        interruption_modes.append("timeout")

        for mode in interruption_modes:
            marker.unlink(missing_ok=True)
            trigger.unlink(missing_ok=True)
            previous_report.parent.mkdir(parents=True, exist_ok=True)
            if mode == "stale-cli-interrupt":
                previous_report.write_text(good, encoding="utf-8")
            else:
                previous_report.unlink(missing_ok=True)
            env = dict(os.environ, ACCEPTANCE_STARTED=str(marker), ACCEPTANCE_TRIGGER=str(trigger))
            if mode.startswith("outer-entrypoint-"):
                env["RECOVERY_TEST_INIT_SCRIPT"] = str(gate)
                cmd = canonical
            else:
                driver = evidence / "driver.py"
                driver.write_text("import sys,os,signal,threading,time\nsys.dont_write_bytecode=True\nsys.path.insert(0," + repr(str(runner.ROOT / "scripts")) + ")\nimport firestore_recovery_runner as r\n"
                    + ("def interrupt():\n while not os.path.exists(os.environ['ACCEPTANCE_TRIGGER']): time.sleep(.05)\n signal.raise_signal(signal." + mode[7:] + ")\nthreading.Thread(target=interrupt,daemon=True).start()\n" if mode.startswith("runner-") else "")
                    # Advance the clock only after real Gradle readiness and PID capture.
                    + ("real_clock=r.time.monotonic\nr.time.monotonic=lambda:real_clock()+(1000 if os.path.exists(os.environ['ACCEPTANCE_TRIGGER']) else 0)\n" if mode == "timeout" else "")
                    + "sys.exit(r.run(gradle_extra=['--no-configuration-cache','-I'," + repr(str(gate)) + "]))\n", encoding="utf-8")
                if "cli-interrupt" in mode:
                    env["NODE_OPTIONS"] = '--require="' + preload.as_posix() + '"'
                cmd = [sys.executable, "-B", str(driver)]
            captured = set()
            def synchronize(process, log):
                wait_for(lambda: marker.exists() or process.poll() is not None)
                assert marker.exists(), log.read_text(encoding="utf-8")
                text = log.read_text(encoding="utf-8")
                run_dir = Path(re.search(r"^Recovery run: (.+)$", text, re.M)[1].strip())
                info = json.loads((run_dir / "processes.json").read_text())
                assert alive(info["gradle"]) and not (run_dir / "gradle-completed.json").exists()
                snapshot = process_snapshot()
                captured.update(descendants([info["firebase"], info["gradle"]], snapshot))
                assert int(marker.read_text()) in captured, "Real Gradle daemon not in owned tree"
                if os.name != "nt":
                    assert os.getpgid(int(marker.read_text())) == info["gradle"], "Gradle daemon escaped owned process group"
                (evidence / f"{mode}-processes.json").write_text(json.dumps({pid: snapshot[pid] for pid in captured if pid in snapshot}, indent=2))
                if mode.startswith("outer-entrypoint-"):
                    sig = signal.SIGINT if mode == "outer-entrypoint-SIGINT" else signal.SIGTERM
                    os.kill(process.pid, sig)
                else:
                    trigger.touch()
            code, text, run_dir = execute(mode, cmd, env, synchronize)
            expected_code = (128 + (signal.SIGINT if mode == "outer-entrypoint-SIGINT" else signal.SIGTERM)) if mode.startswith("outer-entrypoint-") else None
            if expected_code:
                assert code == expected_code, f"Expected {expected_code}, got {code}: {text}"
            else:
                assert code != 0 and "Recovery integration suite: PASS" not in text
            assert not (run_dir / "gradle-completed.json").exists()
            assert not (run_dir / "xml" / runner.REPORT).exists()
            assert not [pid for pid in captured if alive(pid)], "Owned processes survived"
            if mode == "stale-cli-interrupt":
                assert previous_report.read_text(encoding="utf-8") == good
            if "cli-interrupt" in mode:
                assert "Starting a clean shutdown" in text and "Firebase exited before Gradle completed: 0" in text
            results[mode]["owned_survivors"] = []
            results[mode]["listeners"] = []
        if os.name == "nt":
            results["outer-entrypoint-SIGINT"] = {"exit": 130, "pass": False, "owned_survivors": [], "listeners": [], "note": "POSIX-only signal delivery; Windows verified via Job Object containment"}
            results["outer-entrypoint-SIGTERM"] = {"exit": 143, "pass": False, "owned_survivors": [], "listeners": [], "note": "POSIX-only signal delivery; Windows verified via Job Object containment"}
    finally:
        for sig, handler in prev_handlers.items():
            signal.signal(sig, handler)
        if saved is None:
            previous_report.unlink(missing_ok=True)
        else:
            previous_report.write_bytes(saved)

    fail = evidence / "fail.gradle"
    fail.write_text("allprojects { tasks.withType(Test).configureEach { if (name == 'testProdDebugUnitTest') { doFirst { throw new GradleException('ACCEPTANCE intentional Gradle failure') } } } }", encoding="utf-8")
    command = [sys.executable, "-B", "-c", "import sys; sys.path.insert(0,'scripts'); import firestore_recovery_runner as r; sys.exit(r.run(gradle_extra=['--no-configuration-cache','-I'," + repr(str(fail)) + "]))"]
    code, text, run_dir = execute("gradle-failure", command)
    assert code != 0 and "Current Gradle invocation exited 1" in text
    assert not (run_dir / "gradle-completed.json").exists()
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", 8080))
        occupied.listen()
        # execute() checks free ports, so this intentional occupied-port case
        # uses subprocess.run directly and checks release after our socket closes.
        result = subprocess.run(canonical, cwd=runner.ROOT, capture_output=True, text=True, timeout=30)
        assert result.returncode != 0 and "already occupied" in result.stdout + result.stderr
        assert "Recovery integration suite: PASS" not in result.stdout
        results["occupied-port"] = {"exit": result.returncode, "pass": False}
    assert not any(runner.port_open(port) for port in runner.PORTS)
    (evidence / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Acceptance PASS: {evidence}", flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--integration"]:
        integration()
    else:
        unittest.main(verbosity=2)
