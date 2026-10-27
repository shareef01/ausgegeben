# Local backup and restore plan

## Current behaviour

Backup export and restore are implemented on Android and the web. Most of this file is
the original v1 plan, kept for its reasoning. Where the two differ, the code and this
section win.

- **Format:** `ausgegeben-backup`, currently schema version 3. Versions 1 and 2 are still
  read. v2 added category budgets ([Category budgets](category-budgets.md)); v3 added
  recurring templates ([Recurring transactions](recurring-transactions.md)).
- **Merge** adds and updates records from the backup and removes nothing.
- **Replace** makes transactions match the backup. It keeps current categories that are
  not in the backup, and its confirmation dialog on both clients says how many
  ("Current categories kept (not in the backup): N"). It runs as a journalled,
  resumable sequence: it takes a lease, saves a safety snapshot of the account in
  Firestore, applies categories, transactions and deletions in batches of 400, writes
  preferences last, then checks the result against the server
  (`PREPARING` → `SNAPSHOT_READY` → `APPLYING` → `VERIFYING` → `COMPLETED`). An interrupted
  Replace can be resumed, and a Replace can be rolled back to its safety snapshot.
- **Rollback, unlike the plan's item 5:** rollback exists, but it is the same multi-step
  protocol, not an atomic whole-account restore. Changes made from another device while
  a Replace or rollback runs are not isolated.
- **Code:** `web/src/services/backupFormat.ts` and `backupReplace.ts`;
  `app/.../util/BackupFormat.kt`, `util/ReplacePlanner.kt` and the replace functions in
  `data/AppRepository.kt`.

## Original v1 plan (historical)

The current CSV export is accurate for reporting transactions, but it is not a
restorable account backup. Ausgegeben must not use Cloud Storage or Firestore's
managed backup/restore features while Spark-only is a hard requirement.

## Proposed format

Use one UTF-8 JSON file with a fixed top-level shape:

```json
{
  "format": "ausgegeben-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-09-12T12:00:00Z",
  "appVersion": "2.0.6",
  "preferences": {},
  "categories": [],
  "expenses": [],
  "meta": {}
}
```

Arrays retain stable Firestore document IDs separately from document fields. The
format includes every app-owned record type (expense, income, and transfer are all
expense documents distinguished by `transactionType`), category order and types,
preferences/budget, and only the migration metadata required to resume safely. It
must exclude Auth credentials, Firebase tokens, App Check tokens, local encryption
keys, submission journals, and account-deletion tombstones.

## Required import guarantees

Implementation should land only when both clients can satisfy all of these:

1. Parse with a byte and record-count cap; reject duplicate IDs, unknown top-level
   keys, unknown schema versions, invalid UTF-8, non-finite numbers, and oversized
   strings before performing any Firestore write.
2. Apply the same allowlists and bounds as `firestore.rules`, including cent-granular
   positive amounts, date range, valid transaction types, and category references.
3. Show a dry-run summary and require the user to choose **merge** or **replace**.
   Replace must first create and successfully download a fresh local backup.
4. Use deterministic IDs and a locally persisted import journal containing only an
   import ID, content digest, mode, and last completed page. Write categories first,
   transactions in batches no larger than 400, preferences last, and make every page
   idempotent so interruption/retry cannot duplicate data.
5. Never mark the import complete until server reads verify expected IDs and counts.
   Preserve the journal on quota/network/rules failure and surface an exact resumable
   status. Do not claim rollback: Firestore cannot atomically commit a large account.
6. Encrypting the file is a separate product decision. Until then, warn that the
   backup contains financial data, use Android's Storage Access Framework / a browser
   download, avoid app caches, and never send it to telemetry.

## Test gate

Before enabling import, add shared fixtures and test: empty, one record, 400, 401,
thousands of records, malformed/legacy rows, duplicate IDs, missing categories,
sub-cent/non-finite amounts, interrupted pages, retry, quota failure, merge conflicts,
replace pre-backup failure, cross-client export/import parity, and a post-import
server verification failure.
