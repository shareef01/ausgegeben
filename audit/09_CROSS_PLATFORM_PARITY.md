# Cross-platform parity

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`. This review traces production functions and shared inputs. Runner counts are in [13_TEST_EXECUTION.md](13_TEST_EXECUTION.md).

| Contract | Shared evidence | Remaining scope |
| --- | --- | --- |
| Money parser, edit prefill, supported currency formatting, CSV cells | `testdata/money-parity.json`, `web/src/utils/moneyParity.test.ts:24`, `app/src/test/java/com/aus/ausgegeben/util/MoneyParityTest.kt` | The fixture invokes the pure parser directly. Real web input changes meaning before validation in AUS-201. Formatting parity covers the supplied locale vectors and can vary with platform locale data. |
| Period totals, transfers, reporting math, spending pace and CSV | `testdata/financial-parity.json`, `web/src/utils/financialParity.test.ts`, `app/src/test/java/com/aus/ausgegeben/util/FinancialParityTest.kt` | Add repository and screen-level scenarios that distinguish full month and month-to-date and cover long-lived sessions. |
| Category budgets and backup versions | `test-fixtures/category-budgets/`, `web/src/services/categoryBudgets.test.ts`, `app/src/test/java/com/aus/ausgegeben/util/CategoryBudgetsTest.kt` | Exercise edits that move spending across both category and month and delete during optimistic updates. |
| Schedule, receipt identity and restore | `fixtures/recurrence.json`, `testdata/receipt-identity.json`, `testdata/receipt-restore.json`, `web/src/services/recurrence.test.ts`, `app/src/test/java/com/aus/ausgegeben/util/RecurrenceTest.kt` | Check both actual clients after a clock shift, stale tzdb, concurrent cursor changes and restore. |
| Safety snapshot representation | `testdata/safety-snapshot-parity.json`, `web/src/services/safetySnapshot.parity.test.ts`, `app/src/test/java/com/aus/ausgegeben/util/SafetySnapshotParityTest.kt` | Do a bidirectional real export/import with multiple chunks, receipts and legacy ID remapping. |

## Observed semantic differences

- **AUS-201, duplicated here for traceability.** With EUR, both pure parsers are designed to recognize `1.234,56` as 1234.56. The production web amount on-change handler rewrites it to `1,23` and the parse returns 1.23. The Android transaction amount screen uses the numeric keypad path and does not run this web sanitizer. The independent Node probe observed both values. See [03_FINANCIAL_INTEGRITY.md](03_FINANCIAL_INTEGRITY.md).
- Android `CurrencyUtils.parseAmount` ends with `toDoubleOrNull()` without a finite guard at `app/src/main/java/com/aus/ausgegeben/util/CurrencyUtils.kt:139`. Web rejects a nonfinite conversion at `web/src/utils/currency.ts:97`. A synthetic 400-digit input can therefore produce positive infinity on JVM while web returns null. The normal Android transaction keypad constrains magnitude, so this is a helper boundary divergence. Test unbounded text and import entry points before treating it as a production financial defect.
- Web and Android produce local monthly groupings with each device's time zone, while recurring day identity uses the template's fixed zone. Parity testing must pin or explicitly vary both settings.

## Differential regression plan

Generate deterministic JSON Lines with the same seed, raw input, locale, supported currency, dates, zone, frozen clock and ledger rows for both test runners. Use an integer-cent oracle from the original decimal string. Assert equality at the boundaries that users observe, including controlled form text, accepted persisted cents, day/period membership, expense and transfer totals, budget comparison, occurrence ID and receipt map. Use a separate invalid-input corpus for signs, excessive precision, trailing junk, Unicode whitespace, numeric bounds, overflowing sums, duplicate IDs and invalid dates. Include leap, DST and midnight gap cases, replay failures and missing references. Compare machine fields exactly and use explicit locale contracts for human-formatted output.
