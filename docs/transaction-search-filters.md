# Transaction discovery contract

## Ground truth and prior architecture

Work started on `feature/transaction-search-filters` at `c6ddb5e37c8e8ed37c01904354f4a5c4538e4589`, also `origin/main`. Latest release is v2.0.9. No search PR existed; eight local Web files contained an unfinished implementation, which was continued. Unrelated .claude, .cursor and device-backup directories were preserved.

Records did not use conventional cursor pagination on either platform. A month was a complete date-scoped query. Android all-time used a live 5,001-document query, trimmed to 5,000. Web all-time used a shared cached one-shot fetch with the same cap and refreshed on data-change events. Type, one category, and text filters ran locally. Android shared one cold category flow among consumers and reused the month query for list, budget and insights.

## Canonical contract

Search trims whitespace and matches literal, case-insensitive substrings of the transaction note or the current category display name. Blank text adds no constraint. IDs, operation keys, numeric amounts and internal type strings are excluded. Matching uses locale-independent lowercasing; accents are not removed.

Selections inside the category set use OR. Text, transaction type, selected categories, amount bounds and selected period combine with AND. Existing transfer support is retained alongside all/expense/income. Type changes remove incompatible category IDs, category snapshots remove disappeared IDs, and returning to all does not resurrect removed selections.

Amount bounds are inclusive. Inputs accept unsigned ordinary decimal numbers, with a comma or dot and at most two fractional digits. Grouping separators, currency symbols, exponents, negative values, partial garbage and inverted ranges are rejected with visible validation. Raw input has one owner in each ViewModel/hook; comparisons use existing integer minor-unit utilities. An invalid range produces no rows and is explicitly flagged rather than silently retaining old bounds.

Newest/oldest sorting uses date and ascending ID for ties. Highest/lowest sorting uses minor-unit amount, then descending date and ascending ID. Source lists are not mutated. Amount sorting preserves global row order instead of regrouping the sorted list by date.

Clear resets text, type, category selections, bounds and sort. It preserves the independently selected period, matching the previous Web clear behavior. Period changes preserve filters. Soft-delete undo state is separate from filter state.

## Complete corpus and query responsibilities

Records has a dedicated uncapped live query. A selected month uses `dateMillis >= start AND dateMillis < end`; all-time has no date constraints or document limit. Both queries stay under `users/{currentUid}/expenses`, ordered by date. Deleted rows are excluded locally. A server snapshot therefore covers the entire selected period, including records beyond the previous 5,000-row boundary. There are no page cursors to reset or drain: clearing filters reuses the same complete period corpus.

Firestore handles account isolation and date bounds. Text/type/category/amount/sort criteria run locally. This avoids compound-index permutations, listener churn per keystroke, and inconsistent subsets for amount sorting. No Firestore fields, security rules, indexes, backup payloads, restore operations, creation/idempotency semantics or edit concurrency guards change. The existing analytics/export caps remain independent of the Records query.

Android reuses its shared month stream for list/budget/insights and shares one category subscription. Other periods have one period query plus the existing month query. Filtering runs on Dispatchers.Default. Web memoizes derived filters and category lookup maps; it has one period query, one category listener, and a separate month-budget query only when needed. Filter mutations create no requests or listeners. Subscriptions close with consumers, and period changes cancel previous subscriptions.

Account-keyed Android ViewModels and Compose content, and an account-keyed Web shell, prevent retained presentation state from rendering under another account. Repository auth flows rebind Android queries; Web subscriptions rebind on UID changes. Web callbacks check both subscription lifetime and current UID, including after a period switch. Android Records callbacks reject a mismatched UID. Delayed delete/duplicate actions capture their owner; repositories check an expected UID before choosing the write path. Web cancels old-account undo toasts on account exit. The original creation/idempotency algorithm is reused unchanged by the scoped Android duplicate helper.

## Offline, cost and limits

Firestore cached rows can be filtered and sorted offline. Metadata-change subscriptions display an incomplete-coverage notice while a snapshot comes from cache. Uncached older records cannot be discovered offline. The UI makes no complete-history guarantee until the server confirms the selected-period snapshot. This indication is conservative even when the complete historical corpus was previously cached.

The initial read cost is linear in the selected period's document count, including soft-deleted documents; all-time intentionally loads the full history. Live updates read changed documents. Reconnect/resubscribe can incur further reads according to Firestore cache behavior. Large all-time histories can consume a significant part of Spark quota and browser/device memory. The default month scope limits routine reads; users must choose all-time to search across months. No hosted search service is introduced. This is a correctness-first complete-corpus implementation, not an indexed substring search service.

Filtering is O(n + categories), with O(m log m) sorting for matched rows and O(n) corpus storage. A local Web benchmark of 25,000 rows averaged 6.37 ms over ten filtered runs on the development machine; this is not a device/network guarantee. Web still renders all matching rows, while Android uses LazyColumn.

## UX and accessibility

The existing Web sidebar contains a labelled search field, semantic clear button, pressed category buttons, labelled amount fields with aria-invalid and a validation alert, sort select, count and clear-all action. It uses a permanent panel, so there is no new filter dialog focus trap. The existing period menu closes with Escape.

Android keeps the Aurora screen, exposes search initially, uses an IME search action to dismiss focus, and adds a Material bottom sheet with selectable category chips, labelled decimal fields, validation and sort chips. Material controls provide touch/selection semantics; the search input has a TalkBack description. No full manual TalkBack or large-font device audit is claimed.

English and German labels cover all shipped controls and errors. Filtered misses remain distinct from the onboarding empty state. Incomplete cache coverage has a separate notice.

## Adversarial review

- Older paginated records: dedicated uncapped queries; a 5,002-row Firestore fixture finds a match excluded by the old capped query. Android ViewModel coverage uses the same beyond-cap scenario.
- Keystroke listeners: filters are outside query dependencies; browser assertions cover both Records/category listener creation counts.
- Account flash and delayed writes: keyed presentation, UID/lifetime guards and expected-owner write checks; real-browser account switching and Android SDK account-bound reads are covered.
- Stale callbacks: closed-period callbacks are deliberately replayed in browser coverage and ignored.
- Incompatible/deleted categories: compatibility pruning preserves other criteria and existing shared-flow lifecycle tests.
- Decimal drift/inverted ranges: strict parsing and integer comparisons; inclusive and equal bounds are covered.
- Reactive edits/deletes/additions: live snapshots feed the pure engines; tests change matching notes, insert matching records and delete them without clearing filters.
- Clear/period state: clear retains period and returns all period rows, with amount text inputs cleared from their authoritative owner.
- Sorting: deterministic ties and immutable sources; date regrouping no longer invalidates amount order.
- Analytics/backup/recovery: filtering only changes displayed rows; full-period summaries, creation, editing and backup/recovery contracts remain independent.

## Validation

Final executed command counts and CI results are recorded in the PR and completion report. Ordinary Android unit runs intentionally skip the six emulator-only recovery cases; the canonical recovery runner must execute all six separately with zero skips. No new release/tag is created.
