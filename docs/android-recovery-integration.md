# Android Firebase recovery integration

Run from the repository root after `npm ci --prefix web`:

```sh
bash scripts/run-firestore-recovery-tests.sh
```

Requires Python 3.10+ (standard library only), JDK 21+, the Android SDK, Node, and
the repository's locked Firebase CLI (15.30.0).
No AVD or real Firebase credentials are needed. The runner starts Auth (9099) and
Firestore (8080) for `demo-ausgegeben`, using the production `firestore.rules`.
It forces Gradle to execute the test task and rejects missing/skipped scenarios.
Ordinary Android unit runs skip these six tests when the emulator is absent.

## Runner acceptance gate

The shell entry point executes `scripts/firestore_recovery_runner.py` via `exec`
(replacing the outer shell process to ensure transparent cancellation signal propagation
to the Python supervisor). It starts `firebase emulators:start` and Gradle independently:
Firebase's exit code cannot substitute for Gradle completion. Any Firebase exit before
certification is a failure, including its graceful signal path returning zero.

Each invocation exclusively creates `app/build/recovery-runs/run-*/xml` and an
init script that directs this Gradle task's JUnit output there after Android's
task configuration. Reports in the usual test-results directory, or another run's
directory, are never read. After its own Gradle worker exits zero, the supervisor
writes a completion record in that same directory and parses only its report.
The record alone cannot certify success. No timestamp comparison is used.

Python ElementTree requires a complete XML document in Gradle's actual format:
one correctly named suite, exactly the six full `(classname, name)` identities,
one occurrence each, matching counters, and no failure/error/skipped elements.
Names in comments or output do not count. Missing, malformed, truncated, duplicate,
extra, or skipped results fail. The canonical shell entry accepts no test filters;
individual scenarios are exercised only by the Python acceptance tooling.

The supervisor owns separate containers for Firebase and Gradle. On Windows,
workers wait for a pipe handshake until assigned to a Job Object with
`KILL_ON_JOB_CLOSE` and no breakaway permission. Descendants inherit that job even
if their original parent exits. Cleanup terminates the job and waits for its
active-process count to reach zero. Windows uses `gradlew.bat`; run the shell
entry through Git Bash with `python` on PATH.

On POSIX, each worker starts a new session/process group; cleanup sends SIGTERM
then bounded SIGKILL escalation to that owned group, reaps the worker, and verifies
the group has gone. Gradle 9.7.1 otherwise detaches its single-use daemon into a
different group even with `--no-daemon`. The POSIX runner therefore appends
`-Dorg.gradle.native=false` to **JAVA_TOOL_OPTIONS for Gradle**, reaching both the
launcher and daemon before native services initialize. CLI `-D` or `JAVA_OPTS`
alone did not prevent daemon detachment in the real Ubuntu check. This disables
Gradle's native integration, not the Android Firebase SDK. Each new single-use
daemon inherits its invocation's environment directly; it is never reused.
Gradle may warn that it cannot subsequently reset that environment. The real
integration regression checks the daemon's process group as well as surviving
PIDs. The intended POSIX target is Ubuntu.

The shell wrapper `scripts/run-firestore-recovery-tests.sh` executes Python via `exec`
to prevent bash from trapping or ignoring cancellation signals while waiting for
foreground children. CI workflow steps in `.github/workflows/ci.yml` similarly use
`exec`. The Python supervisor installs signal handlers for `SIGINT` and `SIGTERM`
that set a cancellation flag; startup failures, tool failures and the 15-minute run
deadline also enter the same `finally` cleanup. In integration mode, the acceptance
driver (`test_firestore_recovery_runner.py`) also forwards received `SIGINT`/`SIGTERM`
signals directly to active child runners before exit, ensuring graceful cleanup.
PASS is printed only after successful validation **and** cleanup. Occupied ports
(8080, 9099, 4400, 4500, 9150) fail before launch; unrelated builds are never
selected by executable name. Do not run another emulator/build concurrently in this
checkout.

Run maintained regressions with:

```sh
python3 -B scripts/test_firestore_recovery_runner.py
python3 -B scripts/test_firestore_recovery_runner.py --integration
```

Use `python` on Windows. The fast tests exercise malformed XML, real process trees
with lightweight stand-ins, and outer shell `outer-SIGINT` and `outer-SIGTERM`
signal transparency. The integration mode runs three canonical 6/6 executions,
INT-1/2/4/6 individually, then blocks the real Gradle test task at an explicit
readiness marker. It captures owned PIDs before invoking Firebase's real graceful
SIGTERM handler with and without an old genuine report. It also tests supervisor
`runner-SIGINT` and `runner-SIGTERM`, outer canonical entrypoint `outer-entrypoint-SIGINT`
and `outer-entrypoint-SIGTERM`, deadline cleanup, Gradle failure, and an occupied
port. On Windows, signal-handler tests use `signal.raise_signal`/Node `process.emit`;
these exercise installed handlers, not an external Unix signal delivery facility.
The deadline integration test advances the supervisor clock after readiness,
rather than waiting 15 minutes. Logs, PID snapshots, fixtures, and results stay
under `app/build/recovery-acceptance`; CI runs both modes and uploads diagnostics
on failure. No fixtures modify the Kotlin scenarios or production code.

POSIX SIGKILL, machine power loss, and descendants deliberately creating new
sessions are outside the graceful cleanup guarantee. Windows kill-on-close also
provides kernel cleanup if the supervisor is forcibly terminated. GitHub may mark
an externally cancelled job `cancelled` regardless of local exit code; aggregate
CI treats that as failure. This runner does not override GitHub cancellation.

## Isolation and SDK findings

`FirestoreClient` takes no injected Firebase instance: its production constructor
and sign-out cache replacement use the default Firebase app. The harness therefore
recreates the default app for each serial JUnit test rather than changing production
constructors or substituting a repository. Each app has a unique application ID and
fake API key. Users/emails and operation IDs are unique; remote documents are scoped
to the current UID. There is no global emulator data or account deletion.

Installed SDK bytecode was inspected with `javap`:

- Firestore 26.4.1 `FirebaseFirestore.terminate()` removes the database from its
  instance registry. `FirestoreMultiDbComponent.get()` creates a new instance after
  removal. INT-4 and INT-6 assert that replacement has different object identity.
- Auth 24.2.0's internal `zzagq` emulator registry stores endpoints and weak listener
  references in static maps keyed by API key. Reusing a key after app deletion
  notified an old listener and produced `FirebaseApp was deleted` in `useEmulator`.
  Unique fake keys prevent those callbacks from crossing test app lifetimes.

Auth emulator configuration, verified account creation, sign-in, reload, and a
verified token assertion all precede Firestore use. Firestore uses a memory cache
configured before any operation. Teardown awaits termination, signs out, clears
DataStore, and deletes the test app even if a scenario fails. The Robolectric main
looper advances in bounded steps with a wall-clock deadline; worker exceptions
retain their underlying causes.

The old harness also selected the first category in REST document order. Seeded
categories have random IDs and include expense, income, and transfer types. Choosing
an income category for an expense reproduced the production rules denial with fully
isolated clients. Selection now explicitly requires an expense category created by
`AppRepository.ensureSeeded()`. Stale Firestore credentials were a hypothesis, not a
proven explanation of those earlier moving rules failures.

## Scenarios

| Scenario | Property |
|---|---|
| INT-1 | A real commit precedes simulated lost acknowledgement; recovery clears the journal and leaves exactly one remote expense. |
| INT-2 | Ambiguous A survives explicit B's full save lifecycle; reconciliation leaves exactly two distinct remote expenses. |
| INT-3 | Retrying one operation ID returns the same deterministic document and leaves one expense. |
| INT-4 | Recreated production wrappers plus a fresh, empty Firestore memory cache recover a pending durable journal entry through the server. |
| INT-5 | Completing A late preserves pending B, which reconciles independently. |
| INT-6 | Production sign-out clears the journal; B cannot read or reconcile A's expense, and A's remote document survives. |

Authenticated REST assertions independently inspect remote counts, document IDs,
idempotency keys, category, transaction type, amount, date, and scenario notes.
The ambiguity decorator only substitutes an error after the real repository reports
a successful write; a rules denial cannot masquerade as the simulated ambiguity.

## Limits

This is object recreation, not Android OS process death. The real DataStore delegate
remains alive across wrapper recreation; completed edits persist to its file, but
this does not prove a new OS process can reopen it. Tests clear the shared delegate
before and after each serial scenario. Firebase's memory cache deliberately avoids
Robolectric's incompatible persistent SQLite shadow, so persistent Firestore cache
behavior is not covered. Emulators do not establish real backend/network failure,
physical-device, App Check, token revocation/expiry, or Android lifecycle behavior.
The lost acknowledgement is a deterministic test seam, not a transport fault.

The dedicated `android_recovery_integration` CI job uses this runner and feeds the
aggregate CI status. The existing AVD instrumentation job remains separate.

## Validation evidence (2026-09-28)

After runner remediation, Windows acceptance passed three fresh canonical runs
(6/6 each, zero skips), INT-1/2/4/6 individually (1/1 each), and all 20 invalid XML
fixtures derived from a genuine Gradle report. A fourth focused run also passed
6/6 with Gradle's native integration disabled, checking compatibility of that
fallback with the Android suite.

With real Firebase/Gradle processes, old-report and no-report CLI interruptions
both returned 1, supervisor `runner-SIGINT` returned 130, `runner-SIGTERM` returned 143,
outer canonical entrypoint `outer-entrypoint-SIGINT` returned 130, `outer-entrypoint-SIGTERM`
returned 143, and deadline, Gradle-failure and occupied-port cases returned 1.
No failure printed PASS. All captured interrupted process trees and emulator listeners
were gone; the old passing report remained untouched and ineligible. These interruption
fixtures pause before the Gradle test action, so no Android test worker has started at
the checkpoint. Descendant containment is additionally covered by real process-tree
tests, including parent exit, outer shell wrapper signal transparency (`outer-SIGINT`
and `outer-SIGTERM`), and Windows supervisor hard termination.

Portable parser/process tests passed on Windows and Ubuntu 24.04 under WSL. A real
Gradle 9.7.1 single-use daemon on Ubuntu stayed in the owned group with the startup
property and was removed on cleanup. The full Android/Firebase suite was exercised
on Windows, not locally on Ubuntu; CI's Ubuntu job runs the maintained complete
acceptance. No GitHub-hosted run or AVD/physical-device instrumentation was run
during this local remediation.

Fresh broader validation passed: 208 ordinary tests, six expected offline recovery
skips, zero failures/errors/unexpected skips, lint (82 warnings, no errors), debug
and release assembly. Unchanged build tasks reused up-to-date outputs. Workflow
validation passed 22/22 existing tag checks plus all 32 aggregate dependency/status
combinations; instrumentation and PR-head/push-SHA behavior remained unchanged.

The prior independent review's temporary mutations already confirmed that INT-2
rejects a single-slot journal and INT-4 rejects cache-only reconciliation; selecting
an income category reproduced the rules denial. Those restored mutations were not
repeated in this runner-only remediation. The Kotlin scenarios remain byte-for-byte
unchanged from that review.
