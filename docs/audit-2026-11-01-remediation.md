# Audit 2026-11-01 — remediation batches 1 and 2

Baseline: `c17ede1` on `main` (`docs: rewrite README for personal portfolio and add author metadata`).
Working branch: `fix/ausgegeben-audit-remediation`. Nothing here is deployed, pushed or merged.

Batch 1 (below) validated the suspected issues raised in the 2026-11-01 audit request, fixed the
one that reproduced, and recorded what was *verified* rather than assumed. Batch 2 (§ "Batch 2")
extends the same fix to the journalled replace/rollback flow, adds adversarial coverage for the
retry, and supplies real Android emulator execution evidence. Findings keep the request's AUD-x
identifiers.

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
  "Known limitations" and queued for the next batch. *(Resolved in batch 2 — see below.)*

## Batch 2 — replace/rollback, retry safety, Android execution

### AUD-006 in the journalled replace flow (confirmed, fixed)

Batch 1 reconciled the merge restore only. `executeReplace`'s expense upsert and
`rollbackReplace`'s expense restore had the same defect, and were worse in one respect: each
batch also carries the restore-operation/lease update, so a revision refusal failed an
operation that was already half-applied. Reproduced before the change (rules-enforced
emulator, `backupReplace.test.ts`): both new tests failed with
`7 PERMISSION_DENIED: evaluation error at L603/L610`; after the change they pass.

The reconciliation is now a single narrowed helper used by every expense write:

| Path | Web | Android |
|---|---|---|
| Merge restore | `restoreBackup` → `commitRestoredExpenses` | `restoreBackup` → `commitRestoredExpenses` |
| Replace upsert | `executeReplace` step 10 (journalled) | `executeReplace` step 2 (journalled) |
| Rollback | `rollbackReplace` step 3 (journalled, full overwrite) | `rollbackReplace` step 2 (journalled, merge) |

`patchBatch` re-adds the journal/lease write to every attempt, so the retry is still one
atomic batch and there is no unjournalled expense write path. Fencing tokens, lease holder and
`progress.step`/`batchIndex` are recomputed per attempt inside the callback, exactly as the
single-shot batch did.

### Retry safety (answers to the review questions)

| Question | Answer |
|---|---|
| Runs only after `permission-denied`? | Yes — `isPermissionDenied` on the first attempt's error; any other error is rethrown untouched. |
| Distinguishes clock conflict from unrelated authorization failure? | It does not *guess*: it reads the batch's stored revisions and only retries when at least one row is actually ahead of `now`. Otherwise the original error is rethrown (`if (bumped.size === 0) throw error`). If the retry is refused again with `permission-denied`, the *original* error is rethrown — the message never claims clock skew. |
| Server reads, not cache? | `getDocsFromServer` (web) / `.get(Source.SERVER)` (Android) over `documentId() in [...]` pages of 30. |
| Legacy `Timestamp` revisions? | `storedExpenseRevision` accepts a number, a `Timestamp` (`toMillis`) and — on Android — `Timestamp`/`Date`; tested by adversarial case D. |
| Original financial payload preserved? | Only `updatedAt` is overridden; every other field is the caller's payload, including legacy `cloudId`/`categoryCloudId`/`receiptImagePath`/`deleted` on rollback. |
| At most one retry? | Yes. Tested: a hook that keeps pushing the revision forward observes exactly one retry and then a failure. |
| Recomputes only the revisions that need it? | Per row: `Math.max(now, stored + 1)` is applied only to rows whose stored revision is `>= now`; others keep the plain clock value (adversarial case A asserts this). |
| Document deleted between read and retry? | The retry is an upsert, so it recreates the row — documented restore semantics, tested by case L. |
| Stays inside the five-minute window? | A step above `now + 295 000` throws `EXPENSE_REVISION_UNWRITABLE` instead of writing; cases B and C cover both sides of that boundary. |
| Can it overwrite a newer concurrent edit silently? | Yes, and that is unchanged restore semantics (last-writer-wins): the retry writes `stored + 1`, so it beats a row written up to that instant. A row that moves *again* after the lookup defeats the retry and the batch fails closed (case K). |

Read cost: zero extra reads on a successful batch; on a refusal, one read per existing row in
that batch (30 per query), capped by the batch size. No collection scans.

### Adversarial coverage (web, rules enforced)

`web/emulator/restoreRevisionAdversarial.test.ts` — A–N as requested: 4-minutes-ahead (A),
near-boundary step (B), unstoppable revision (C), legacy `Timestamp` (D), foreign account (E),
unrelated authorization refusal (F), category mid-deletion (G), account-deletion tombstone (H),
`idempotencyKey` replay (I), changed amount (J), concurrent bump between lookup and retry (K),
deleted between lookup and retry (L), interrupted restore resumed and replayed without
duplicates (M/N), and the single-retry bound. All 14 pass; each states its expected outcome in
the test body.

### Android execution evidence

`FirestoreEmulatorRecoveryTest` now has `rel3`–`rel6`, executed against the real Firestore and
Auth emulators through `scripts/firestore_recovery_runner.py` (they are in the runner's
`TESTS` tuple, so the gate fails if they are skipped):

| Test | Asserts |
|---|---|
| `rel3_…RevisionIsAheadOfTheClock_succeeds` | merge restore over a +4 min row succeeds and steps past it |
| `rel4_…RefusesRevisionItCannotLegallyExceed` | `EXPENSE_REVISION_UNWRITABLE`, row untouched |
| `rel5_unrelatedAuthorizationRefusalIsNotReportedAsClockSkew` | a missing-category refusal surfaces as `PERMISSION_DENIED`, never as clock skew |
| `rel6_replaceAndRollbackOverFutureRevision_keepJournalAndSnapshot` | replace upsert reconciled; failure keeps `FAILED_RECOVERABLE` + `snapshotMeta`; rollback steps over the new revision and reaches `ROLLED_BACK` |

Runner result after the change: `Recovery integration suite: PASS (13 executed, 0 skipped)`.
Failing-before evidence: with only the Android replace/rollback wiring reverted,
`rel6` fails with `org.junit.ComparisonFailure` (the expected
`FAULT_INJECTED_AFTER_EXPENSE_UPSERT_BATCH` message is instead the rules' `PERMISSION_DENIED`).

### Suite stability (batch 1's two timeouts)

Re-ran the full emulator suite with nothing else on the machine: **150 passed / 15 files, exit
0, 141 s**, no timeouts. The batch-1 failures were CPU contention with a concurrent Gradle lint
build (the same file passes 33/33 in isolation, and took 204 s under load versus 44 s alone).
No test, timeout or implementation change was made to accommodate them.

### Financial parity (phase 6) — outstanding

`testdata/money-parity.json` pins display, parsing (31 cases), CSV rounding (5) and input
handling (7) across Kotlin and TypeScript, and both suites pass. Aggregate parity — totals,
income/transfer split, net balance, monthly and category totals, budget remaining, recurring
values — has no shared fixture on either platform, so it was **not** verified in this batch.
That is the top item for the next one.
## Batch 3 — financial parity, restore concurrency, privacy disclosure

### Concurrency of the AUD-006 retry (verified, no defect)

`web/emulator/restoreConcurrency.test.ts` drives a **second authenticated client** (a separate
Firestore instance for the same uid) between the revision read and the retry commit, at all
three legal orderings:

| Concurrent edit revision | Result |
|---|---|
| below the proposed restore revision | concurrent write accepted, then overwritten by the restore; final `updatedAt` = stored + 1 |
| equal to the proposed restore revision | concurrent write accepted, then overwritten — `>=` is an ordering check, not a CAS |
| above the proposed restore revision | concurrent edit survives, restore fails closed with `PERMISSION_DENIED`, nothing written |

Also pinned: a refused retry writes **nothing**, not even the rows in the same batch that were
individually writable (batch atomicity), and a validation refusal (the category staged for
deletion between lookup and retry) cannot be turned into a write by advancing `updatedAt`.

Conclusion: merge restore and the journalled replace are both intentional overwrites
(last-writer-wins for the whole document, already documented in `docs/maintenance.md`). The
retry neither adds nor removes conflict protection — it only stops the *ordering* rule from
rejecting an otherwise legal restore. No code change was needed; the semantics are now pinned
by tests and stated explicitly in the maintenance contract.

### Cross-platform financial parity (verified)

New shared fixture `testdata/financial-parity.json` (synthetic only) with expected values
derived by hand from the documented rules. Consumed by production code on both platforms:

| Metric | Web | Android |
|---|---|---|
| totals / transfers / net | `computeTotals` (`web/src/utils/analytics.ts`) | `buildInsightsState` (`ui/InsightsViewModel.kt`) |
| category totals | `groupByCategory` | `buildInsightsState().expensesByCategory` etc. |
| day totals | `computeDayTotals` (`utils/analytics.ts`) | `computeDayTotals` (`util/PeriodUtils.kt`) |
| all-time averages | `computeAllTimeAverages` | `computeAllTimeAverages` (`util/InsightsAnalytics.kt`) |
| budget progress / remaining / state | `categoryBudgetProgress` (`services/categoryBudgets.ts`) | `categoryBudgetProgress` (`data/entity/CategoryBudget.kt`) |
| budget allocation | `budgetAllocation` | `budgetAllocation` |
| period comparison | `computePeriodComparison` | `computePeriodComparison` |
| spending pace | `computeSpendingPace` | `computeSpendingPace` |
| month ranges (incl. DST) | `analyticsDateRangeMillis` | `analyticsDateRangeMillis` |
| CSV cell amounts | `formatCsvAmount` | `ExportUtils.formatAmountCell` |
| JSON backup amounts | `createBackup` | `BackupFormat.createBackupJson` |

Results: 11 web cases and 12 Android cases pass against the same expected values, so both
clients implement the rules rather than merely agreeing with each other. Coverage in the
fixture: ordinary expenses/income, transfers excluded from spending and net, multiple
categories with budgets, a soft-deleted row, an orphaned category, a migrating category, a
large amount under the rules ceiling, cent-boundary values (0.05/0.10/0.20/0.30), month and
year boundaries at millisecond precision, a Europe/Berlin DST day, a DST-length month, and
restore-then-recalculate (exported amounts re-aggregate to the same totals).

Deliberate divergence recorded, not "fixed": a transfer-only day produces a zero entry on web
and no entry on Android; no money differs.

Not covered (unchanged): Firestore server-side `sumMonthExpenses` (needs the emulator and a
composite index; its client-side counterparts are covered), and exchange-rate behaviour — the
app relabels currency without converting by design.

### Privacy disclosure (confirmed gap, fixed)

Nothing in either client told the user that a JSON backup is an unencrypted copy of their whole
financial history. The export row now says so in both languages on both platforms
(`settingsExportBackupSub` / `settings_export_backup_subtitle`), and `web/src/i18n/index.test.ts`
fails if the disclosure is dropped. Reviewed and found clean: Android logging (messages and
exception objects only, no amounts/notes/tokens; the App Check debug secret is behind
`BuildConfig.DEBUG` plus a system property), and the web error sink's credential-shape
redaction with its documented limitation that free text is not filtered.
