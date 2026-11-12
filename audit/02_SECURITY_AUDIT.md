# 02 Security audit

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

## Threat model and rule coverage

External actors include unauthenticated requests, authenticated users with an unrelated UID, an unverified owner, a verified owner using a custom SDK, and stale official clients. An authenticated owner's browser or phone can read that owner's ledger. Script execution or local profile access on that device crosses a separate boundary from Firestore authorization.

| Path | Server guarantees | Limits |
|---|---|---|
| users/{uid}, unmatched paths | Parent access explicitly denied, unmatched paths denied by default | Explicit subcollection grants |
| expenses | UID ownership, verified ordinary mutations, merged field allowlist, positive bounded amount, cent tolerance, date range, bounded text, existing category and type checks | Revision optional, last-writer behavior, category checks use pre-commit state |
| categories | UID ownership, verified ordinary mutations, staged type changes, category budget constraint, reciprocal recurring counters | Finalization lacks proof linked expenses moved |
| categoryBudgets | UID ownership, verified writes, positive bounded cent amount, integer threshold 1–100, strictly advancing timestamp, post-batch active expense category | No aggregate account-level cap |
| recurringTransactions | UID ownership, verified mutation, UUID, shape, cadence bounds, date/zone syntax, immutable creation and zone on update, reciprocal category counters | Zone and calendar/schedule consistency partly client-enforced |
| recurringOccurrences | UID ownership, verified creation, composite ID/date and expense ID syntax, immutable updates, deletion only in armed account wipe | Receipt rules accept syntactically valid standalone receipts without proving derivation or existence of an expense |
| settings | UID ownership, only preferences writeable, bounded shape, strict timestamp advancement and compatibility allowance for unchanged historical budgets | Clock tolerance and intentionally retained legacy values |
| meta | UID ownership, recognized document IDs, recent authentication for account deletion, restore lease constraints, permanent deletion marker | Recovery protocol and ordinary mutations have separate rules |
| restoreSnapshot | UID ownership, verified writes for matching operation in PREPARING, finite ID space, bounded Firestore document size | Snapshot list elements and preference map contents are validated by recovery clients |

All explicit read and mutation grants include owner checks directly or through `canDeleteOwned`. `isOwner` compares `request.auth.uid` to the matched path segment. Public Firebase app configuration identifies project resources. Auth and rules mediate authorization. Deployment App Check enforcement requires separate console evidence. Its SDK token flow adds an attestation layer. The snapshot cap still allows a verified owner to consume up to approximately 201 MiB across snapshot documents before indexing overhead. Per-account document count/rate limits are absent for ordinary rows. The availability impact depends on deployed quotas, attestation, and attacker ability to create verified accounts.

`web/src/services/firebase.ts` uses session/memory defaults and explicit trusted-device durable storage. Sign-out is broadcast across tabs. `tools/error-endpoint/src/index.js` limits request size, verifies App Check signatures with a cooldown on forced key refreshes, and uses a separate Worker. Run endpoint tests for token, origin and payload cases. React JSX uses escaping by default. Any future HTML injection, external URL interpolation or telemetry expansion warrants a targeted sink review. No cross-UID authorization bypass is established by this review.

## AUS-101 Category migration can finalize with linked expenses on the old type

- Severity P2 Medium. Classification confirmed bug. Status reproduced against the isolated Firestore emulator.
- Affected code `firestore.rules:63–72`, `firestore.rules:253–272`, `firestore.rules:585–592`, `firestore.rules:601–618`. The application migration follows a multi-stage protocol in `web/src/repositories/expenseRepository.ts:267–302` and `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:536–590`.
- Reproduction with an isolated verified owner. Create an expense category with no budget or recurring references and an expense classified as expense. Stage the category with `migrationState=migrating` and `pendingTransactionType=income`. Update only the category to `transactionType=income`, removing both migration fields. Read both documents.
- Expected category finalization leaves all linked rows classified consistently, or refuses the transition. Actual the rules' predicates permit the final update while the expense keeps its original type. A concurrent stale client can also write an old-type reference during the staged window.
- Root cause the category transition validates document shape, staged target and budget/recurrence state. It does not prove the expense collection is migrated. During staging the reference check accepts both types.
- Impact inconsistent reports and category associations in the same account. Some future edits must repair the type to pass validation. A client-side maintenance pass may later repair affected data. No cross-account access is required or implied.
- Minimal fix block new old-type references while staged, coordinate ordinary writes and re-scan before finalization, and document which invariant the client can guarantee. If strict server enforcement is required, use a trusted finalizer or a versioned invariant that the rules can evaluate without a collection scan.
- Regression submit the two-step sequence via the rules emulator, then interleave a stale write after the final official-client page scan. Assert refusal or deterministic repair and consistent totals.
- Compatibility staged migrations may already exist. Preserve legacy reference and sentinel behavior while rolling out a recovery path.

## Emulator evidence

The isolated demo-audit-critical probe used Firestore emulator 1.22.0 and SDK 13.1.0. The owner finalized category type income while the linked expense remained expense. A second UID was denied read access to that expense. The executable probe is critical-rules-probe.mjs.

## Additional adversarial cases

Owner and unrelated-user read/write cases, unauthenticated access, merged-field validation, replay, preferences timestamps, bounded receipt shapes, and restore lease behavior are covered by the suites in `web/rules`. Add an atomic category-delete-plus-expense-create case. The expense rule inspects `get` rather than `getAfter`, but an already-deleting category blocks the simplest form of that batch. Add a deletion-marker-plus-ordinary-write batch to confirm the exact barrier semantics, since the marker check is pre-commit. Account deletion scans after marking, so that edge alone does not establish surviving data. Add nested snapshot poisoning tests and quantify quota use only with a local disposable project. Verify deployments and scanner execution in the execution report.
