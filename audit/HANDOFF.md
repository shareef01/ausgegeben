# Ausgegeben audit handoff

The audit reviewed `f3897a6befb6fef999c32447a78b7f68c83010d5`. The first implementation batch is commit `ca80f839d169e1849c7ff16e649cf661f2d607dd` in [PR #156](https://github.com/shareef01/ausgegeben/pull/156). The handoff branch includes that commit and the audit reports. PR #156 was open when the handoff was prepared.

## Pick up on another machine

```sh
git fetch origin
git switch --track origin/codex/audit-handoff
```

Open this repository in Codex and use this prompt to resume from the saved context:

> Read audit/HANDOFF.md, audit/AUDIT_PROGRESS.md, and audit/REMEDIATION_ROADMAP.md. Check PR #156 and the current main branch. Continue with the legacy preference-sync gap, then address the remaining findings in roadmap order. Preserve historical financial data and use synthetic accounts on disposable local emulators for verification. Keep implementation PRs scoped.

For a follow-up PR, base the implementation branch on current `origin/main` once PR #156 has merged. While it is open, work that depends on it can build from the PR head and use that branch as the base. This handoff branch keeps the audit evidence available independently.

## What is done

- AUS-201. Web transaction and recurring amount fields validate the original input.
- AUS-102. Android sign-out leaves the session active when queued Firestore writes cannot drain within three seconds.
- AUS-103. Web and Android finalize preferences and the restore journal atomically, read the live revision transactionally, and roll back to an absent preference document when the snapshot captured absence.
- The first batch passed 643 web unit tests, four Chromium tests, 23 web restore emulator tests, 436 Android JVM tests, and all 15 Android recovery emulator tests. The web production build and lint checks passed. See [execution evidence](13_TEST_EXECUTION.md) and [progress](AUDIT_PROGRESS.md).

## What remains

1. **Legacy preference sync.** A device that already cached imported preferences during an older interrupted restore can still upload those values through ordinary preference sync after rollback deletes the cloud document. Old snapshots that record absence lack a previous device-local value. Test startup and live-listener behavior, including another device with stale cached preferences and a genuine preference edit after rollback.
2. **Remaining findings.** Follow the [roadmap](REMEDIATION_ROADMAP.md), beginning with category migration (AUS-101), recurring catch-up and receipt authority (AUS-202/203), Insights date windows (AUS-204), and release safeguards (AUS-401/402). The [findings register](AUSGEGEBEN_MASTER_AUDIT.md#verification-matrix-and-findings-register) has all 13 IDs.
3. **Repository test baseline.** The full audit-time web Firestore repository run passed 174 of 180 tests. It reported six timeouts. Three selected scenarios passed in follow-up, including the large-history case with a longer deadline. Run the relevant suites on a quiet host before attributing a new failure to a change.

Use the checked-in Android CI Firebase fixture in an isolated test checkout. Generate the browser emulator environment from the CI workflow and use the demo project IDs from the test scripts. The Android recovery runner and browser suite use the same default emulator ports, so run them sequentially.
