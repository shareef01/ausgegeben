# Category budgets

Category budgets are recurring limits for expense categories. They apply to the current calendar month in the device time zone. Categories without a budget have no limit. Income, transfer, and categories undergoing type migration are excluded. Historical Insights periods do not apply today's limits retrospectively. There are no notifications or historical budget versions.

## Storage and concurrency

Each budget is `users/{uid}/categoryBudgets/{categoryId}` with exactly `monthlyLimit`, `warningThresholdPercent`, and `updatedAt`. The category ID is the document ID. Dedicated documents permit strict rules validation and independent changes without rewriting the global preferences document or validating a dynamic map. The global monthly budget remains in preferences.

Limits use the existing major-unit storage convention but must be positive, less than 1,000,000,000, and exactly representable to two decimal places within floating-point tolerance. Calculations convert once to integer minor units. The warning percentage is an integer from 1 to 100, default 80. Zero is invalid; removal is explicit. Currency changes relabel existing amounts, including limits; they do not convert values.

Editors capture the document revision, require a server read, and commit an online Firestore transaction. The preflight is explicit because Web SDK transactions can bypass `disableNetwork`; mutations read the budget once in preflight and again in the transaction (plus transaction retries). A changed or removed revision fails with a conflict and the user can reopen the editor. Writes use a strictly increasing millisecond timestamp. Rules reject stale/equal timestamps and timestamps more than five minutes in the future. Budget edits/removals are not queued offline. Owner checks, listener cleanup, and account-keyed UI prevent stale account callbacks from publishing data.

## Progress and global allocation

Only non-deleted expense transactions from the complete selected current-month Records range contribute. Per-category sums use minor units. Remaining is `max(0, limit - spent)`; overspent is `max(0, spent - limit)`. Percent is not capped, but the progress bar is capped at 100. At the warning boundary the state becomes warning. Exactly the limit is reached, and strictly above it is exceeded. A threshold of 100 therefore reaches the limit directly. Rows sort by descending utilization with category ID as a deterministic tie breaker.

Category budgets are independent allocations. Their sum can be below, equal to, or above the global budget. Settings shows total allocation, non-negative unallocated capacity when a global budget exists, and a non-blocking over-allocation warning. Without a global budget only the total is shown. Global projections keep their existing calculation.

## Category lifecycle and account deletion

Names, icons, and colors resolve through the category ID, so edits retain budgets. Final category deletion atomically removes its budget after linked transactions have been reassigned. Final migration away from expense atomically removes the budget. Migration/deletion barriers reject budget writes. Failed operations retain their resumable markers. Rules require the budget to be absent after a category deletion or migration to a non-expense type; older clients cannot orphan a budget. Both account deletion registries sweep and verify the collection.

## Backups and replacement

Exports use schema v2 with a `categoryBudgets` list containing category IDs plus the three document fields. Import accepts v1 and v2. V1 cannot carry a budget section; v2 requires one. Invalid limits, thresholds, timestamps, duplicate IDs, unknown categories, and non-expense category references fail validation. Shared Android/Web fixtures exercise v1, v2 empty/single/multiple collections, a custom threshold, and the maximum valid amount, and exporter tests verify the v2 golden contract. Older clients that only support v1 cannot import v2 exports.

V1 merge and replace preserve existing budgets. V2 merge upserts represented budgets; it does not remove omitted budgets. V2 replace makes the budget collection exactly match the imported list, including an empty list. Replace fingerprints include v2 budgets as sorted JSON tuples of category ID, minor-unit limit, and threshold; delimiter-bearing IDs cannot collide with several budget entries. Legacy v1 fingerprints remain unchanged. Valid existing category IDs are not restricted to the length of app-generated UUIDs.

Exports and safety snapshots require a server-complete budget read; an incomplete offline cache cannot be exported as an empty budget collection. Safety snapshots capture budgets alongside categories/preferences before replacement. Rollback reads server-confirmed snapshot metadata/chunks and checks that the snapshot belongs to the selected operation before journalling or financial writes. It rejects missing or changed chunks. All budget restore mutations, including removals, use the same online-only transaction helper as editing. Rollback restores the exact original budget IDs and financial values, removing budgets created by replacement and restoring removed ones. Restoration advances timestamps to satisfy monotonic rules; original revision timestamps are not restored verbatim. Older snapshots without a budget section preserve current budgets. Existing replace category-conflict safeguards and recovery journal behavior remain in force. Replacement and rollback use the existing multi-step protocol rather than an atomic whole-account snapshot; concurrent changes from another device during restore are not isolated.

## Offline, lifecycle, accessibility, and cost

Budget listeners include metadata. Cached or failed budget/spending coverage displays an incomplete notice and suppresses reassuring normal-state wording. Cached figures may be visible but are not represented as server-complete. Online transactions are required for mutations.

Settings and current-month Insights each use one collection listener per mounted consumer. Android flows are scoped to the signed-in user and use existing subscription grace periods. The complete current-month transaction stream is reused; there are no per-category transaction reads or listeners. Calculation is O(transactions + categories + budgets), with O(budgets log budgets) sorting. Settings uses category maps/sets rather than repeated scans for budget matching.

Both platforms have English/German text, named inputs, explicit invalid/error states, text warning labels independent of color, and named bounded progress indicators. Android controls use at least 48dp touch targets and scrollable editing; Web uses existing responsive field/button styling and wrapping actions. Automated browser checks cover editing, stale-editor conflicts, warning progress, repeated navigation without transaction listener churn, sign-out cleanup, and account B starting without account A budgets. A manual TalkBack/VoiceOver or large-font device audit has not been performed.

## Deployment

New clients and these Firestore rules must be deployed together before production use. This milestone does not change release versions or publish an Android release. The repository CI and canonical Android recovery runner validate the implementation before merge.
