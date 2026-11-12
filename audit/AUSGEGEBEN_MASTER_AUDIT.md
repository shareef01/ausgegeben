# Ausgegeben master audit

**Baseline:** `f3897a6befb6fef999c32447a78b7f68c83010d5` on `chore/release-2.1.17`, initially clean, 542 tracked paths. Audit date 2026-11-12, Europe/Berlin.

The audit covers the Android and web apps, shared financial and recurrence logic, Firebase rules and indexes, local and cloud persistence, backup and recovery, release workflows, and the telemetry Worker. [Architecture and trust boundaries](01_ARCHITECTURE.md)

The findings register records three high, eight medium and two low findings. No critical finding met the audit's evidence threshold.

## Priority findings

1. **AUS-201 · P1 High.** The web amount input can silently store a different value from the paste. The production input helper reproduced `1.234,56 → 1,23`, turning an intended €1,234.56 into €1.23.
2. **AUS-102 · P1 High.** Android sign-out can clear unacknowledged expense updates and deletions after the UI has returned success. Preserve the user's queued operations across sign-out or resolve their disposition explicitly.
3. **AUS-103 · P1 High.** Replace rollback can reject its final preference write when the live revision is ahead, and an originally absent preference document can survive rollback as an imported preference document. Treat present and absent preferences explicitly and compute rollback revisions against the live server state.

## What the controls establish

Firestore rules scope the reviewed collections to the authenticated UID. No cross-account bypass was identified. Owner-side rule gaps can still break category and recurrence invariants. The account-deletion workflow has a server-side write freeze tied to recent authentication. App Check and browser security headers add defenses with distinct trust boundaries. See [security](02_SECURITY_AUDIT.md).

The applications derive financial reports from transaction rows and use shared fixtures for cent rounding and reporting. The tracked schema has categories and budgets without account-ledger balances or transfer postings. Same-days current-month comparisons can include future-dated entries. [Financial integrity](03_FINANCIAL_INTEGRITY.md), [cross-platform parity](09_CROSS_PLATFORM_PARITY.md)

Ordinary offline mutations can be locally visible before the backend accepts them. Existing mechanisms include stable creation keys, recovery journals for creates, metadata-aware listeners, monotonic update rules, and write batches for selected invariants. Concurrent full-record updates can overwrite independent field changes. Recurrence uses stable occurrence identity and persistent receipts, with a bounded client-triggered catch-up. [Offline sync](04_OFFLINE_SYNC_AND_CONCURRENCY.md), [recurrence](05_RECURRING_TRANSACTIONS.md)

Replace restore publishes a safety snapshot before destructive phases and persists a journal to coordinate retries and rollbacks. Its multi-batch behavior can expose partial state while a replacement is in progress. The preference rollback finding qualifies recovery completion. [Backup and restore](06_BACKUP_RESTORE.md)

Pinned workflow actions, wrapper verification, release gates, APK signer fingerprint, metadata checks, SHA-256 checksums and provenance are checked into the release process. Mutable release refs and a fail-open release-list status undermine two specific guarantees. npm reported two root development-tool advisories. [CI/CD and dependencies](12_CICD_DEPENDENCIES.md)

## Test results

Passed 643 web unit tests, 146 Firestore rules tests, 24 Chromium browser tests, 436 Android JVM tests, 40 Android instrumentation tests, 15 Android recovery integration tests and 19 telemetry tests. The Android JVM run intentionally skipped the 15 emulator cases subsequently exercised by the dedicated runner. The web production build, offline PWA shell probe, Android lint, debug APK and unsigned R8 release APK passed. The main Firestore repository suite passed 174 of 180 tests, with six timeouts. Targeted reruns cleared the three selected failure scenarios across the original tests and an isolated longer-deadline probe. The first Python runner self-test had one failed timeout assertion. The repeat passed all five tests. [Test execution and scope](13_TEST_EXECUTION.md)

The recovery acceptance harness also passed repeated full runs, selected standalone scenarios and forced interruption checks on Windows.

## Verification matrix and findings register

| ID | Priority | Finding | Primary evidence and regression |
|---|---|---|---|
| AUS-101 | P2 | Category migration can finalize with linked expenses still on the old type | [Rules and direct-SDK probe](02_SECURITY_AUDIT.md) |
| AUS-102 | P1 | Android sign-out can discard offline edits and deletions | [Timeout and cache-clear source chain and offline sign-out scenario](04_OFFLINE_SYNC_AND_CONCURRENCY.md) |
| AUS-103 | P1 | Replace rollback can fail or preserve imported preferences | [Both rollback writers, monotonic rule and fault-injection steps](06_BACKUP_RESTORE.md) |
| AUS-104 | P2 | Concurrent full-row edits overwrite unrelated field changes | [Two-device interleaving and merge regression](04_OFFLINE_SYNC_AND_CONCURRENCY.md) |
| AUS-201 | P1 | Web amount input silently changes pasted values | [Executed production-helper probe and input paths](03_FINANCIAL_INTEGRITY.md) |
| AUS-202 | P2 | Foreground recurrence processing may leave due occurrences outstanding indefinitely | [Bounded cursor and lifecycle triggers](05_RECURRING_TRANSACTIONS.md) |
| AUS-203 | P2 | A standalone same-owner receipt can suppress a recurring expense | [Rules and receipt-authority paths](05_RECURRING_TRANSACTIONS.md) |
| AUS-204 | P2 | Current-month same-days comparison includes future-dated transactions | [Both period projections and worked regression](03_FINANCIAL_INTEGRITY.md) |
| AUS-301 | P2 | Android startup can replace an eligible delayed reminder | [Activity/WorkManager sequence](07_ANDROID_AUDIT.md) |
| AUS-302 | P3 | Open web Insights omits a newly started month | [Month options memoization and fake-clock regression](08_WEB_PWA_AUDIT.md) |
| AUS-303 | P3 | Settings radiogroups lack arrow-key navigation | [Markup, keyboard behavior and regression](11_PRIVACY_ACCESSIBILITY.md) |
| AUS-401 | P2 | Release signing can resolve a different SHA from the gates | [Workflow refs and throwaway tag-move regression](12_CICD_DEPENDENCIES.md) |
| AUS-402 | P2 | Failed release-list requests can bypass the versionCode guard | [Process substitution and fake CLI regression](12_CICD_DEPENDENCIES.md) |

The linked chapters hold classifications, source locations, reproductions, expected and actual results, impact, fixes and compatibility risks. Runtime coverage and unavailable checks are recorded in [test execution](13_TEST_EXECUTION.md). [Performance](10_PERFORMANCE.md) distinguishes synthetic work from end-to-end behavior. Remaining verification includes live enforcement and release protections, prolonged outage and cross-device schedules, device accessibility, and regulated data-handling questions.

## Handoff

Fix silent amount transformation and both recovery issues first, with narrow regressions for invalid/grouped pastes, unacknowledged edits, and preferences present/absent across interrupted rollback. Then enforce category migration and recurrence invariants, correct comparable time windows, and pin release gates and signing to the same commit. [Remediation roadmap](REMEDIATION_ROADMAP.md)
