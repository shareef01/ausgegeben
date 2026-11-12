# 04 Offline sync and concurrency

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

Android uses the Firestore disk cache. Web uses a memory cache by default and permits durable multi-tab storage on explicitly trusted devices (`web/src/services/firebase.ts:182–195`). Both clients use latency compensation and return before a pending Firestore acknowledgment after a grace interval (`web/src/repositories/expenseRepository.ts:361`, `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:829`). The web in-memory queue adds an unload guard while tracked writes remain pending (`web/src/services/queuedWrites.ts:33–48`). New expense submission journals reconcile some uncertain insert outcomes. Existing-row edits and deletions rely on ordinary SDK writes. Loss at sign-out and stale full-record overwrites therefore have different causes.

| Scenario | Observed source behavior | Verification |
|---|---|---|
| Offline insert, edit, delete | Local queue and grace timeout. Edits update documents and deletes remove them. | `offlineSave.test.ts`, Android recovery suite and proposed device run |
| Restart while offline | Android disk cache and trusted web storage can retain pending Firestore mutations. The default web memory cache loses them if the tab exits. | Cold restart separately for all storage policies |
| Reconnect or uncertain outcome | The SDK resolves or rejects queued writes, and the journal can reconcile keyed submissions. | `expenseSubmissionReconciliation.test.ts`, `PendingExpenseJournalTest.kt` |
| Two clients edit one row | Full-record payload replaces fields and revision comparison uses numeric ordering | Test two clients editing distinct fields from same base |
| Delete versus stale edit | Updates require an existing document, which prevents edit-based resurrection. | `concurrentResurrection.test.ts` |
| Switch account with pending writes | Owner-scoped paths and rules protect account boundaries. Android explicitly clears the cache. | AUS-102 |
| Interrupted batch | Each batch is atomic. Replace spans several commits. | `batchAtomicity.test.ts`, `restoreFaults.test.ts`, AUS-103 |
| Stale cached data | Clients can render cached rows. Local write acceptance precedes server arbitration. | Test stale category and stale edit after independent server mutation |

## AUS-102 Android sign-out discards acknowledged-in-UI offline expense edits and deletions

- Severity P1 High. Classification confirmed bug. Status source-confirmed.
- Affected code `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:829–833, 911–951`, `app/src/main/java/com/aus/ausgegeben/data/auth/AuthRepository.kt:95–99`, `app/src/main/java/com/aus/ausgegeben/data/FirestoreClient.kt:29–35`.
- Reproduction with a disposable account and two existing expenses. Disconnect Firestore. Edit one row and delete the other, wait for the local operation to return, then sign out before reconnecting. Reconnect, sign in, and read the server from a separate client.
- Expected users can distinguish pending edits from server-confirmed edits and knowingly resolve pending changes before sign-out. Actual the repository returns normally after the timeout, sign-out proceeds, and termination plus clearPersistence removes the unsent queue. The server retains both pre-change rows.
- Root cause delayed acknowledgement is collapsed into a successful `Result<Unit>`, and sign-out destroys Firestore persistence without first resolving pending edits and deletes. A new-submission journal cannot reconstruct arbitrary existing-row mutations.
- Impact changes that were visible locally disappear across account changes, reverting financial history and totals. The cache purge protects local privacy and should remain available.
- Minimal fix track owner-scoped pending mutations, expose queued and rejected states, and offer a sign-out decision that preserves privacy. A successful flush may permit normal sign-out. An explicit discard must tell the user which local operations will be removed.
- Regression use an Android emulator with an isolated Firestore emulator and a cuttable connection. Assert queued state before sign-out, no silent discard, successful replay after reconnect, explicit discard behavior, and account isolation.
- Compatibility do not retain shared-device account data after explicit discard. Handle old SDK-queued changes that have no app-level journal metadata.

## AUS-104 Concurrent edits to distinct fields overwrite each other

- Severity P2 Medium. Classification design limitation. Status source-confirmed.
- Affected code `web/src/repositories/expenseRepository.ts:896–922`, `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:911–929`, `firestore.rules:175–189,610–618`.
- Reproduction start with amount 10 and note Lunch. Devices A and B open that revision. A changes amount to 15 and commits. B changes note to Dinner from its stale draft and submits with a later timestamp. Both payloads are valid.
- Expected if field-level editing is promised, final amount 15 and note Dinner, or the second editor gets a conflict. Actual final amount 10 and note Dinner. The later full-record payload contains the stale amount. Equal timestamps are also accepted.
- Root cause scalar timestamp ordering is not an expected-base revision precondition, and the edit sends the full transaction payload.
- Impact independent edits are silently lost. Deletion has separate existence protection.
- Minimal fix record the expected revision and dirty fields, then apply explicit conflict behavior. Legacy revisions can be normalized for comparisons.
- Regression use two Firestore clients against isolated rules and exercise distinct-field and same-field conflicts, stale offline replay, ties, and legacy timestamps.
- Compatibility avoid blocking historical documents that have no revision until a migration or explicit fallback exists.

Android recovery test int6_signOutClearsPendingOperations_nextAccountCannotReconcileThem validates intentional local account-state clearing and isolation. It does not assert what the user sees or what happens to unsynced edits/deletes. The web offline suite covers queued create, edit, delete and reconnect but does not establish Android behavior across sign-out. The reproduction steps above are source traces. Test execution and environment constraints are recorded separately in the test execution report.
