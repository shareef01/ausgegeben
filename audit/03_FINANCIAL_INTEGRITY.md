# Financial integrity

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`. Source review and local pure-function probe. Suite execution is recorded in [13_TEST_EXECUTION.md](13_TEST_EXECUTION.md).

## Implemented accounting contract

- A record contains a positive magnitude, category ID, date in epoch milliseconds and a transaction type. There is one ledger per user and a display currency preference. The transaction models contain neither per-record currency nor source/destination accounts. There are no account-specific opening balances, currency conversions or paired transfer postings to reconcile. Changing display currency reinterprets the same numeric history. Treat this as a product limitation and consider explicitly explaining the scope in the currency selector. See `web/src/models/types.ts:18`, `app/src/main/java/com/aus/ausgegeben/data/entity/Expense.kt:5` and `web/src/views/SettingsView.tsx:572`.
- Valid ordinary writes use two decimal digits and amounts below one billion, enforced by `firestore.rules:125`. Clients store decimal numbers and convert to integer cents when accumulating reporting totals. `web/src/utils/money.ts:1` and `app/src/main/java/com/aus/ausgegeben/util/CurrencyUtils.kt:15` use matching rounding for supported finite values. Three rows of 0.10, 0.20 and 0.30 sum to 60 cents in these paths. The aggregate type is JS number on web and Kotlin Long on Android. The 5,000-row web all-time cap bounds a valid-input sum below 500 trillion cents, within JavaScript's safe integer domain.
- Web `computeTotals` separates transfer totals and calculates net as income minus expense. Android `buildInsightsState` separates the same types. For income 100, expense 20 and transfer 50 the expected net is 80 and expense spend 20. Category budgets use expense rows only. See `web/src/utils/analytics.ts:35`, `app/src/main/java/com/aus/ausgegeben/ui/InsightsViewModel.kt:177` and `app/src/main/java/com/aus/ausgegeben/data/entity/CategoryBudget.kt:15`.
- Ordinary edits update a document, and ordinary deletes remove it. Restore uses tombstones in selected phases. Reports recompute from scoped snapshots. See the sync report for acknowledgment and concurrent edit behavior. At large histories, capped all-time read models expose truncation (`web/src/repositories/expenseRepository.ts:428,925–936`, `app/src/main/java/com/aus/ausgegeben/data/AppRepository.kt:935–951,1156`).
- Monthly ranges use the device's local calendar, with an inclusive start and exclusive end. The same UTC instant can fall in different reporting months on two devices. For example, 2026-11-01T00:30Z is November in Berlin and October in New York. This is an existing modeling choice. Decide explicitly whether reporting should follow a stable ledger time zone before changing historical grouping. See `web/src/utils/periodUtils.ts:77` and `app/src/main/java/com/aus/ausgegeben/util/PeriodUtils.kt:76`.
- Both settings support EUR, USD, GBP and CHF, with two fractional digits. Cash flow uses daily buckets for a selected month and populated monthly buckets for all time. It excludes transfers and sums income and expenses separately in cents. Spending pace rounds daily average to cents before projecting the rest of an active month, and uses the actual total for a completed month. See `web/src/utils/currency.ts:143`, `web/src/utils/analytics.ts:143–179,246–299`, `app/src/main/java/com/aus/ausgegeben/util/CurrencyUtils.kt:8`, `app/src/main/java/com/aus/ausgegeben/util/WealthTrend.kt` and `app/src/main/java/com/aus/ausgegeben/util/InsightsAnalytics.kt:107–165`.

## AUS-201 · Web amount fields silently change pasted values

- **Severity / classification / status** — P1 High / confirmed bug / reproduced in the production helpers. Browser interaction and server round trip remain regression steps.
- **Affected code** — `web/src/utils/currency.ts:62` and `:168`, `web/src/views/AddTransactionView.tsx:148`, `web/src/viewmodels/useAddTransactionViewModel.ts:284` and `:317`, `web/src/components/RecurringEditor.tsx:168`, `web/src/components/recurringDraft.ts:95`.
- **Reproduction and evidence** — In an EUR web transaction or recurring editor, paste `1.234,56` into the amount field. The on-change handler feeds it to `sanitizeAmountInput`, and saving parses the rewritten draft. A Node v24.16.0 probe imported the actual production functions (stripping TypeScript types and the unused i18n imports) and exercised this composition.

| Raw input | Direct strict parse | Controlled draft | Effective amount |
| --- | ---: | --- | ---: |
| `1.234,56` | 1234.56 | `1,23` | 1.23 |
| `1,234.56` | 1234.56 | `1,23` | 1.23 |
| `-42` | rejected | `42` | 42.00 |
| `1,239` | rejected | `1,23` | 1.23 |
| `1000000000` | 1000000000 (outside save bound) | `100000000` | 100000000.00 |

- **Expected** — Valid grouping preserves exact value. Invalid sign, ambiguous precision or an out-of-range amount yields a field error before submission.
- **Root cause** — The editable text path drops disallowed characters, treats the first separator as the decimal point and truncates integer and fractional digits. Strict validation runs after the input has changed meaning.
- **Impact** — A valid receipt value of 1234.56 can be recorded as 1.23, understating spend by 1233.33 and feeding the wrong amount into budgets, exports and recurrence. The rewritten draft is visible, which provides an opportunity to catch it.
- **Fix** — Keep raw text on the keyboard/paste path and validate its interpretation and upper bound at submission. The numeric keypad can preserve its input constraints independently. If normalizing presentation, do so only after a successful parse and preserve the parsed value.
- **Regression** — Drive both forms using keyboard and clipboard events. Save supported grouped EUR/USD amounts and verify the payload in cents. Submit minus, excess decimal, mixed-separator ambiguity, zero and one-billion boundary inputs and assert zero writes for rejected drafts.
- **Compatibility** — Historical data stays unchanged. Users who relied on silent truncation receive explicit validation. Review affected historical records only when users can identify them from original statements.

## AUS-204 · Current-month comparison mixes full-month and month-to-date amounts

- **Severity / classification / status** — P2 Medium / confirmed bug / reproduced with production web range and calculation helpers. Android integration is source-confirmed.
- **Affected code** — `web/src/viewmodels/useInsightsViewModel.ts:48–49`, `:87–115` and `:194–205`, `web/src/utils/periodUtils.ts:103–113`, `web/src/views/InsightsView.tsx:396–398`, `app/src/main/java/com/aus/ausgegeben/ui/InsightsViewModel.kt:78–85` and `:253–258`, `app/src/main/java/com/aus/ausgegeben/util/PeriodUtils.kt:171–183`.
- **Reproduction** — On November 12 in one pinned zone, enter an expense of 100 for October 10, 100 for November 10 and a future-dated 400 for November 28. Open current-month Insights on both clients. Both editors accept selectable future dates within the valid Firestore date bounds.
- **Expected** — “vs same days last month” compares November 1–12 with October 1–12. Expense delta is 0 and change is 0%. The full-month headline can retain the future entry if intentional.
- **Actual** — Current expense total fed to comparison is 500 from the full November range. Prior total is 100 from October 1–12. A Node v24.16.0 probe loading the production web functions `analyticsDateRangeMillis`, `previousPeriodRange`, `computeTotals` and `computePeriodComparison` returned `expenseDelta: 400`, `expensePercentageDelta: 400` and `netDelta: -400`. Category movers also use the current month input.
- **Root cause** — The prior query ends at the matching calendar day and the current query still ends at the month boundary. The comparison uses the unfiltered headline totals.
- **Impact** — Scheduled or deliberately future-dated records can overstate the month-to-date comparison and falsely signal large category shifts. The same input also inflates elapsed spending pace. Under the existing cent-rounding policy, the fixture's full-month input yields a daily average of 41.67 and a projection of 1,250.10. With elapsed spend of 100, the daily average is 8.33 and the projection is 249.90. This pace calculation is source-confirmed in `web/src/viewmodels/useInsightsViewModel.ts:207–208`, `web/src/utils/analytics.ts:259–290` and `app/src/main/java/com/aus/ausgegeben/ui/InsightsViewModel.kt:261–265`.
- **Fix** — Derive one local start-of-tomorrow cutoff from a shared clock. Use it for the current comparison, category movers and elapsed spending pace while retaining full-month input for any intentionally full-month widget.
- **Regression** — Freeze a clock and run the exact fixture through both view models. Include a transaction just before and exactly at the exclusive cutoff, a shorter prior month and a DST transition. Verify the current and prior ranges on rollover.
- **Compatibility** — Read-model change. Historical transaction timestamps and full-month totals remain intact.

## Verification gaps

Exercise category and global budgets with soft-deleted rows, recategorization and edits moving across month boundaries. Add repeated cent sums and large-value rows against a decimal oracle and round-trip both backup serializers. Compare budget projections, cash flow, past/future records and spending velocity under a frozen clock and DST-aware zones. Current suite coverage is detailed in the parity and test reports.
