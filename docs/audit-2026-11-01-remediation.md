# Audit 2026-11-01 — remediation batch 1

Baseline: `c17ede1` on `main` (`docs: rewrite README for personal portfolio and add author metadata`).
Working branch: `fix/ausgegeben-audit-remediation`. Nothing here is deployed, pushed or merged.

This batch validates the suspected issues raised in the 2026-11-01 audit request, fixes the
one that reproduced, and records what was *verified* rather than assumed. Findings keep the
request's AUD-x identifiers.

## Test baseline (before any change)

| Suite | Command | Result |
|---|---|---|
| Web unit | `npm test` (in `web/`) | 563 passed / 48 files, exit 0 |
| Web types | `npm run lint` | exit 0 |
| Web CSS / hooks / telemetry | `npm run lint:css`, `lint:hooks`, `lint:telemetry` | exit 0 |
| Web rules (emulator) | `npm run test:rules` | 146 passed / 4 files, exit 0 |
| Web emulator repositories | `npm run test:emulator` | 131 passed / 14 files, exit 0 |
| Web build | `npm run build` | exit 0 |
| Web prod-env guard | `npm run test:prod-env` | 3 passed, exit 0 |
| Worker | `npm test` (in `tools/error-endpoint`) | 19 passed, exit 0 |
| Android unit | `./gradlew testProdDebugUnitTest` | 399 tests, 0 failures, 9 skipped (emulator-backed, none attached) |

Not run: `npm run test:e2e` (Playwright + Auth emulator) and Android instrumentation
(`connectedProdDebugAndroidTest`) — both need a dedicated browser/AVD, and the guidance is
never to let Gradle pick an arbitrary attached device. Neither path is touched by this batch.

### After the change

| Suite | Result |
|---|---|
| `npm test` | 570 passed / 49 files (563 + 7 new unit tests), exit 0 |
| `npm run lint`, `lint:css`, `lint:hooks`, `lint:telemetry`, `npm run build` | exit 0 |
| `npx vitest … emulator/backupRestore.test.ts` | 14 passed (11 existing + 3 new) |
| `npm run test:emulator` | 132 passed, 2 failed — both timeouts in `expenseRepository.test.ts` while a Gradle lint build ran on the same machine; the file passes 33/33 in isolation (44 s). Environmental, not a regression: that file does not import anything this batch touched. |
| Android `testProdDebugUnitTest`, `lintProdDebug`, `assembleProdDebug` | 399 tests / 0 failures; BUILD SUCCESSFUL |

## Findings

| ID | Suspected | Status | Evidence |
|---|---|---|---|
| AUD-01 | Financial precision splits between clients | REQUIRES VERIFICATION (no divergence found) | Amounts are cent-granular in `validExpense`, `validateBackup`, `expenseWritePayload` and the Kotlin payloads; `testdata/money-parity.json` and `test-fixtures/` pin both parsers. No new divergence surfaced in this batch. |
| AUD-02 | Backup fidelity / restore loses data | PARTLY CONFIRMED — see AUD-006 | Soft-deleted rows are excluded on export and `idempotencyKey` is exported but never written back (both deliberate; recorded below). The restore abort itself was a real recovery defect. |
| AUD-03 | `isIdempotentCreationReplay`/`isLegitimateExpenseUpdate` reject a restore over an existing keyed expense | **NOT REPRODUCED** | Rules-enforced emulator tests `merge-restores an expense that still carries its idempotencyKey` and `merge-restores an expense that was edited after the export` both pass. A merge restore of the exported values *is* the creation replay; any supported edit clears the key (`updateExpense` → `deleteField()` / `FieldValue.delete()`), so the merged document no longer carries one and `isLegitimateExpenseUpdate` accepts it. A divergent keyed row cannot exist: a raw update that keeps the key and changes a value is refused by the rules (asserted in the probe, `evaluation error at L610`). |
| AUD-004 | Firestore rules ownership/validation | See "controls verified"; unchanged | Rules and their 146 emulator tests are untouched by this batch. |
| AUD-005 | Recurring duplication | No new defect found | Occurrence identity is `templateId_date` plus the SHA-256 expense id; receipts are write-once in rules. |
| AUD-006 | Restore cannot overwrite a row whose revision is ahead of the device clock | **CONFIRMED, FIXED** | See below. |
| AUD-07 | Privacy/local data | No change; `lint:telemetry` guard passes | Not re-audited in this batch. |
| AUD-08 | CI/dependencies/deployment | No change | Not re-audited in this batch. |

## AUD-006 — confirmed defect (P1, failed recovery)

**Symptom.** A merge restore of any backup over an expense row whose stored `updatedAt` is
ahead of the restoring device's clock is refused with `PERMISSION_DENIED`. The refusal hits
the whole expense batch — after the category batch has already committed — so the account is
left half-restored and the user sees a bare permission error.

**Root cause.** `firestore.rules` bounds expense revisions from both sides:
`validUpdatedAt` accepts a stored value up to `request.time + 300000` (a device whose clock
ran fast legitimately writes one), while `monotonicallyIncreasingExpenseUpdatedAt` refuses a
write whose revision is older than the stored row. The restore wrote `Date.now()` — the one
value it cannot know is enough. The file cannot answer the question either: it carries the
revision from export time, not what is stored now.

**Reproduction** (rules-enforced emulator, before the fix):

```
seed users/{uid}/expenses/legacy-random-id-1  updatedAt = now + 240_000
restoreBackup(backup containing that id, amount 5 → 7)
→ 7 PERMISSION_DENIED  (evaluation error at L603 create, L610 update)
→ categories written: 1, expense amount: still 5, preferences: never written
```

**Fix (both clients, same shape).** Commit the expense batch exactly as before; only if the
rules refuse it, read that batch's stored revisions from the server (30-id pages) and retry
once with just the offending rows stepped over their stored value. Nothing extra is read on
a normal restore, and rows that were already writable keep the plain clock revision, so the
retry cannot plant future timestamps on documents that never needed them. A stored revision
no legal write can exceed throws `EXPENSE_REVISION_UNWRITABLE` instead of a bare
`PERMISSION_DENIED`.

- `web/src/services/restoreExpenseBatch.ts` — `commitRestoredExpenses`,
  `readStoredExpenseRevisions`, `restoredExpenseRevision`, `storedExpenseRevision`
- `web/src/services/backupRestore.ts` — the expense batch loop now calls it
- `app/.../data/BackupRestoreRepository.kt` — `commitRestoredExpenses`,
  `readStoredExpenseRevisions`, `storedExpenseRevision`
- `app/.../util/BackupFormat.kt` — `restoredExpenseRevision` plus the two window constants

**Tests.**

- `web/emulator/backupRestore.test.ts` — `merge-restores over an expense whose stored
  revision is ahead of this device clock`. Verified failing before the change
  (`FirebaseError: 7 PERMISSION_DENIED`) and passing after.
- `web/src/services/restoreExpenseBatch.test.ts` — revision arithmetic, legacy `Timestamp`
  reads, and the window bound (7 unit tests).
- `app/.../util/BackupFormatIntegrityTest.kt` — `restoredExpenseRevisionStepsOverRowsAheadOfTheClock`.
- Two AUD-03 regression pins were added to `web/emulator/backupRestore.test.ts` so a future
  rules or restore change cannot silently break the keyed-row paths.

## Controls verified in this batch

- Verified by test, not documentation: owner isolation and field validation through the
  rules suite (146 tests), restore batching under the 20-document-access budget, restore
  refusal before the first write for an unwritable preferences window, and the AUD-03
  keyed-row paths above.
- Not verified here: production rules deployment, App Check enforcement, R8/release
  packaging, and the Cloudflare Worker. All remain deployment-time checks.

## Recorded, not changed

- **`idempotencyKey` in web backups.** `createBackup` exports it (sliced to 100 characters)
  while `restoreBackup` ignores it and the Android format never emits it. It is inert on
  restore, so this is a format asymmetry rather than a defect; removing it would change the
  documented backup schema, which this batch deliberately does not touch.
- **Soft-deleted expenses are not exported** (`createBackup` filters `e.deleted`), so a merge
  restore cannot resurrect one. Documented in `docs/maintenance.md`.
- **Replace-flow expense writes still use the plain clock.** A refusal there lands in the
  journalled `FAILED_RECOVERABLE` path (and the rollback can also be refused), so it is
  bounded but not reconciled like the merge restore. Recorded in `docs/maintenance.md`
  "Known limitations" and queued for the next batch.
