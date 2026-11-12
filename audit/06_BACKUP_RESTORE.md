# 06 Backup, restore and data-loss prevention

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

Shared JSON supports versions 1–3, with per-category budgets introduced in version 2 and recurring templates/receipts in version 3. Both formats validate domain values and references before applying. Expense amounts use cent normalization. Replacement fingerprints match the originally supplied file across a resume. A fingerprint supports identity and accidental mismatch detection. It carries no signature or proof of provenance. Legacy schema handling and safety snapshot parity have dedicated fixtures in `test-fixtures` and `testdata`.

| Operation | Durability and coverage |
|---|---|
| Export | Portable financial categories, transactions, preferences, versioned budgets/recurrence. Inspect cloud/export differences around legacy operational fields, which serve a different purpose from portable data. |
| Merge | Multi-commit, no safety snapshot/journal. A failure after an accepted batch leaves the committed prefix. Existing fault tests exercise this behavior. |
| Replace | Plans against live revisions, acquires a recovery lease, stores snapshot and phase metadata, then applies and verifies in stages. Snapshot chunks are awaited before applying begins. There is no single Firestore transaction for the restore. |
| Resume | Requires matching backup fingerprint and reuses prior snapshot metadata. |
| Rollback | Replays captured collections. A partial failure can leave the operation recoverable. Receipts are immutable outside account deletion. Restore retains committed receipts.. |
| Verification | Server samples validate selected documents. Concurrent writes and unverified collection values require additional coverage. |

Web paths `web/src/services/backupFormat.ts`, `backupRestore.ts`, `backupReplace.ts`, `backupSnapshot.ts`, `restoreOperation.ts` and `restoreLimits.ts`. Android counterparts are `util/BackupFormat.kt`, `util/ReplacePlanner.kt`, `util/SafetySnapshot.kt` and `data/BackupRestoreRepository.kt`. The lease check precedes groups of commits. Ordinary writes are not fenced by the Firestore restore journal. A stale offline write can synchronize into the recovery window, and a stalled former holder may still have an outstanding batch after its lease expires. Prove the impact using two clients, forced expiry and an injected disconnect between lease check and commit. Distinguish observed commits from client predictions.

## AUS-103 Rollback can reject its preference write or leave replacement preferences active

- Severity P1 High. Classification confirmed bug. Status reproduced at the Firestore rules boundary for the rollback revision case. The absent-preferences case and complete recovery sequence are source-confirmed.
- Affected code `web/src/services/backupReplace.ts:660–665,1042–1054`, `app/src/main/java/com/aus/ausgegeben/data/BackupRestoreRepository.kt:1092–1116,1444–1465`, `firestore.rules:635–642`.
- Reproduction A. Snapshot existing preferences whose revision is earlier than local time. Replace with a valid backup carrying a preference revision about two minutes in the future. Permit its preferences commit and then interrupt before completion. Roll back immediately using the same clock.
- Expected rollback restores the snapshotted preferences with a valid advancing revision. Actual both clients derive `max(local clock, snapshot revision + 1)`. If live revision is two minutes ahead, rules require a greater timestamp and reject this write after earlier rollback batches may have committed.
- Reproduction B. Run the same scenario with no server preference document at snapshot time. Roll back. Both clients skip the preference step and may mark `ROLLED_BACK` while the preferences created by replace remain.
- Root cause rollback derives its preference revision from snapshot state and local clock only, and treats a missing preference snapshot as a no-op rather than an absent baseline to restore.
- Impact recovery can stall after restoring other collections, or report success with the wrong currency, locale, theme and monthly budget. The ledger may temporarily display totals under the wrong preference context.
- Minimal fix use a server revision and the existing bounded preferences revision helper during rollback. Guard the update against concurrent change. Capture document absence explicitly and delete only a document known to have been introduced by the restore or after a documented conflict decision.
- Regression isolate emulator data. Inject interruption after preferences commit, assert rollback handles a live revision +120 seconds, verify original preference values, and repeat with absent preferences. Also test a live revision near the five-minute rules cap and an intervening legitimate user write.
- Compatibility retain support for old snapshots where absence may need to be inferred. Preserve legacy budget normalization behavior and avoid overwriting concurrent preference changes accidentally.

## Emulator evidence

The isolated demo-audit-critical probe used Firestore emulator 1.22.0 and SDK 13.1.0. It confirmed the rules accepted replacement preferences with currency USD and a revision 120 seconds ahead, denied the client rollback formula's write with PERMISSION_DENIED, and retained USD. The executable probe is critical-rules-probe.mjs. The probe exercises the exact rule and revision formula with synthetic documents. The complete replacement operation and both app UIs remain separate verification steps.

## Fault verification cases

Use disposable emulator accounts to cut connections before snapshot creation, during chunk writes, after SNAPSHOT_READY, between category and expense commits, after preferences commit, during VERIFYING, and in rollback. Assert the precise durable collection state and the operation phase after restart. Include malformed JSON, duplicates, broken references, oversized lists, mixed-version fixtures, immutable receipt mismatch and a stale lease holder. Existing suites `web/emulator/backupReplace.test.ts`, `restoreFaults.test.ts`, `restoreRevisionAdversarial.test.ts` and Android `FirestoreEmulatorRecoveryTest.kt` provide test entry points. Execution status belongs in the test execution report.
