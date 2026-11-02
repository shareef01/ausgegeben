package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.CategoryBudget
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.entity.budgetAllocation
import com.aus.ausgegeben.data.entity.categoryBudgetProgress
import com.aus.ausgegeben.ui.buildInsightsState
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Cross-platform financial parity. Loads testdata/financial-parity.json — the same file the
 * web suite reads in web/src/utils/financialParity.test.ts — and runs the Android production
 * functions over it.
 *
 * Every expected value in the fixture was derived by hand from the documented rules in
 * docs/maintenance.md, not captured from either client, so a match on both sides is evidence
 * that both implement the rule rather than that they agree with each other.
 *
 * The zone is pinned because day/month bucketing and DST month length are local-calendar
 * questions; the web test pins Europe/Berlin too.
 */
class FinancialParityTest {

    private val fixture: JSONObject by lazy {
        val stream = checkNotNull(javaClass.classLoader!!.getResourceAsStream("financial-parity.json")) {
            "testdata/financial-parity.json must be on the unit-test classpath"
        }
        JSONObject(stream.bufferedReader().readText())
    }
    private val expected: JSONObject get() = fixture.getJSONObject("expected")

    private lateinit var originalZone: TimeZone

    @Before
    fun pinTimeZone() {
        originalZone = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone(fixture.getString("timeZone")))
    }

    @After
    fun restoreTimeZone() {
        TimeZone.setDefault(originalZone)
    }

    // ---- fixture mapping ---------------------------------------------------------

    private val categories: List<Category> by lazy {
        fixture.getJSONArray("categories").collect { o ->
            Category(
                id = o.getString("id"),
                name = o.getString("name"),
                iconName = o.getString("iconName"),
                colorInt = o.getInt("colorInt"),
                transactionType = o.getString("transactionType"),
                sortOrder = o.optInt("sortOrder", 0),
                migrationState = o.optString("migrationState", "").ifEmpty { null },
                pendingTransactionType = o.optString("pendingTransactionType", "").ifEmpty { null },
            )
        }
    }

    private val allExpenses: List<Expense> by lazy {
        fixture.getJSONArray("expenses").collect { o ->
            Expense(
                id = o.getString("id"),
                amount = o.getDouble("amount"),
                dateMillis = o.getLong("dateMillis"),
                categoryId = o.getString("categoryId"),
                note = o.getString("note"),
                transactionType = o.getString("transactionType"),
                deleted = o.optBoolean("deleted", false),
            )
        }
    }

    /** The repository contract: soft-deleted rows never reach an aggregate. */
    private val liveExpenses: List<Expense> by lazy { allExpenses.filter { !it.deleted } }

    private val budgets: List<CategoryBudget> by lazy {
        fixture.getJSONArray("budgets").collect { o ->
            CategoryBudget(
                categoryId = o.getString("categoryId"),
                monthlyLimit = o.getDouble("monthlyLimit"),
                warningThresholdPercent = o.getInt("warningThresholdPercent"),
                updatedAt = o.getLong("updatedAt"),
            )
        }
    }

    private fun <T> JSONArray.collect(block: (JSONObject) -> T): List<T> =
        (0 until length()).map { block(getJSONObject(it)) }

    private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }

    private fun JSONObject.moneyMap(): Map<String, Double> = keys().asSequence().associateWith { getDouble(it) }

    private fun categoryTotals(state: com.aus.ausgegeben.ui.InsightsUiState) =
        state.expensesByCategory.entries.associate { it.key.id to it.value }

    private fun assertMoney(expectedValue: Double, actual: Double, label: String) {
        assertEquals(label, expectedValue, actual, 0.0)
    }

    // ---- tests -------------------------------------------------------------------

    @Test
    fun totalsMatchTheDocumentedRules() {
        val totals = expected.getJSONObject("totals")
        // all_time keeps every live row; transfers are counted separately and never enter net.
        val state = buildInsightsState(
            fixture.getString("currency"), categories, liveExpenses, AnalyticsPeriod.ALL_TIME.storageKey, truncated = false,
        )
        assertMoney(totals.getDouble("totalExpenses"), state.totalExpenses, "totalExpenses")
        assertMoney(totals.getDouble("totalIncome"), state.totalIncome, "totalIncome")
        assertMoney(totals.getDouble("totalTransfers"), state.totalTransfers, "totalTransfers")
        assertMoney(totals.getDouble("net"), CurrencyUtils.fromMinorUnits(
            CurrencyUtils.toMinorUnits(state.totalIncome) - CurrencyUtils.toMinorUnits(state.totalExpenses),
        ), "net")
    }

    @Test
    fun categoryTotalsKeepTheOrphanedCategoryRow() {
        val state = buildInsightsState(
            fixture.getString("currency"), categories, liveExpenses, AnalyticsPeriod.ALL_TIME.storageKey, truncated = false,
        )
        assertEquals(expected.getJSONObject("expenseByCategory").moneyMap(), categoryTotals(state))
        assertEquals(
            expected.getJSONObject("incomeByCategory").moneyMap(),
            state.incomeByCategory.entries.associate { it.key.id to it.value },
        )
        assertEquals(
            expected.getJSONObject("transfersByCategory").moneyMap(),
            state.transfersByCategory.entries.associate { it.key.id to it.value },
        )
    }

    @Test
    fun dayTotalsFollowTheLocalCalendar() {
        val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val actual = computeDayTotals(liveExpenses).entries.associate { (dayStart, pair) ->
            dayFormat.format(Date(dayStart)) to pair
        }
        val wanted = expected.getJSONObject("dayTotals")
        for (day in wanted.keys()) {
            val value = wanted.getJSONObject(day)
            val pair = actual[day]
            assertNotNull("day $day", pair)
            assertMoney(value.getDouble("income"), pair!!.first, "$day income")
            assertMoney(value.getDouble("expense"), pair.second, "$day expense")
        }
        // Documented divergence: Android omits a transfer-only day entirely, while the web
        // function emits a zero income/expense entry for it. Transfers carry no daily total.
        assertFalse(
            "transfer-only day must not produce a totals entry",
            actual.containsKey(expected.getString("dayTotalsTransferOnlyDay")),
        )
        assertEquals(wanted.length(), actual.size)
    }

    @Test
    fun allTimeAveragesUseTheMonthsThatContainRows() {
        val wanted = expected.getJSONObject("allTimeAverages")
        val actual = checkNotNull(computeAllTimeAverages(liveExpenses))
        assertEquals(wanted.getInt("monthsCount"), actual.monthsCount)
        assertMoney(wanted.getDouble("averageMonthlyExpenses"), actual.averageMonthlyExpenses, "avg expenses")
        assertMoney(wanted.getDouble("averageMonthlyIncome"), actual.averageMonthlyIncome, "avg income")
        assertMoney(wanted.getDouble("averageMonthlyNet"), actual.averageMonthlyNet, "avg net")
    }

    @Test
    fun budgetProgressExcludesDeletedRowsAndIneligibleCategories() {
        // The deleted row is deliberately included in the input: the function must exclude it.
        val progress = categoryBudgetProgress(budgets, categories, allExpenses)
        val wanted = expected.getJSONArray("budgetProgress")
        assertEquals(wanted.length(), progress.size)
        for (i in 0 until wanted.length()) {
            val row = wanted.getJSONObject(i)
            val actual = progress[i]
            assertEquals(row.getString("categoryId"), actual.budget.categoryId)
            assertMoney(row.getDouble("spent"), actual.spent, "spent")
            assertMoney(row.getDouble("remaining"), actual.remaining, "remaining")
            assertMoney(row.getDouble("overspent"), actual.overspent, "overspent")
            assertMoney(row.getDouble("percent"), actual.percent, "percent")
            assertEquals(row.getString("state"), actual.state)
        }
    }

    @Test
    fun budgetAllocationClampsAtZero() {
        val wanted = expected.getJSONArray("budgetAllocation")
        for (i in 0 until wanted.length()) {
            val row = wanted.getJSONObject(i)
            val actual = budgetAllocation(budgets, row.getDouble("global"))
            assertMoney(row.getDouble("total"), actual.total, "total")
            assertMoney(row.getDouble("unallocated"), actual.unallocated!!, "unallocated")
            assertMoney(row.getDouble("overAllocated"), actual.overAllocated, "overAllocated")
        }
        assertNull(budgetAllocation(budgets, null).unallocated)
    }

    @Test
    fun periodComparisonUsesCentExactDeltas() {
        val c = expected.getJSONObject("periodComparison")
        val actual = computePeriodComparison(
            c.getDouble("currentExpenses"),
            c.getDouble("currentIncome"),
            c.getDouble("priorExpenses"),
            c.getDouble("priorIncome"),
            c.getBoolean("hasPriorData"),
        )
        assertMoney(c.getDouble("priorExpensesResult"), actual.priorExpenses, "priorExpenses")
        assertMoney(c.getDouble("priorIncomeResult"), actual.priorIncome, "priorIncome")
        assertMoney(c.getDouble("expenseDelta"), actual.expenseDelta, "expenseDelta")
        assertMoney(c.getDouble("expensePercentageDelta"), actual.expensePercentageDelta!!, "expensePercentageDelta")
        assertMoney(c.getDouble("incomeDelta"), actual.incomeDelta, "incomeDelta")
        assertMoney(c.getDouble("incomePercentageDelta"), actual.incomePercentageDelta!!, "incomePercentageDelta")
        assertMoney(c.getDouble("netDelta"), actual.netDelta, "netDelta")
    }

    @Test
    fun spendingPaceProjectsActivePastAndFutureMonths() {
        val cases = expected.getJSONArray("spendingPace")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val actual = checkNotNull(
                computeSpendingPace(
                    c.getDouble("currentExpenses"),
                    c.getLong("rangeStart") to c.getLong("rangeEnd"),
                    c.getLong("nowMillis"),
                    c.getDouble("monthlyBudget"),
                ),
            ) { "no pace for ${c.getString("case")}" }
            assertEquals(c.getInt("daysElapsed"), actual.daysElapsed)
            assertEquals(c.getInt("daysInMonth"), actual.daysInMonth)
            assertMoney(c.getDouble("dailyAverage"), actual.dailyAverage, "dailyAverage")
            assertMoney(c.getDouble("projectedTotal"), actual.projectedTotal, "projectedTotal")
            assertMoney(c.getDouble("budget"), actual.budget!!, "budget")
            if (c.isNull("projectedOverBudget")) {
                assertNull("${c.getString("case")} must not overshoot", actual.projectedOverBudget)
            } else {
                assertMoney(c.getDouble("projectedOverBudget"), actual.projectedOverBudget!!, "projectedOverBudget")
            }
        }
    }

    @Test
    fun monthRangesResolveAtLocalMidnightIncludingDst() {
        val wanted = expected.getJSONObject("periodRanges")
        for (key in wanted.keys()) {
            val range = wanted.getJSONArray(key)
            val actual = checkNotNull(analyticsDateRangeMillis(key, 1768474800000L)) { "no range for $key" }
            assertEquals(key, range.getLong(0), actual.first)
            assertEquals(key, range.getLong(1), actual.second)
        }
    }

    @Test
    fun csvAmountsRenderTwoDecimalsAtEveryCentBoundary() {
        val wanted = expected.getJSONObject("csvAmounts")
        for (amount in wanted.keys()) {
            assertEquals(amount, wanted.getString(amount), ExportUtils.formatAmountCell(amount.toDouble()))
        }
    }

    @Test
    fun backupJsonKeepsExactAmountsAndOmitsSoftDeletedRows() {
        val wanted = expected.getJSONObject("backupAmounts")
        val json = JSONObject(
            BackupFormat.createBackupJson(
                preferences = BackupFormat.BackupPreferences(currency = fixture.getString("currency"), monthlyBudget = null),
                categories = categories,
                expenses = allExpenses,
                appVersion = "parity",
                exportedAt = "2026-10-01T00:00:00Z",
                categoryBudgets = budgets,
                schemaVersion = 3,
            ),
        )
        val rows = json.getJSONArray("expenses")
        val ids = (0 until rows.length()).map { rows.getJSONObject(it).getString("id") }.sorted()
        val included = wanted.getJSONArray("includedIds").strings()
        assertEquals(included.sorted(), ids)
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            val source = allExpenses.first { it.id == row.getString("id") }
            assertMoney(source.amount, row.getDouble("amount"), row.getString("id"))
        }
        val excluded = wanted.getJSONArray("excludedIds").strings()
        excluded.forEach { assertTrue("$it must not be exported", it !in ids) }
    }

    @Test
    fun roundTrippedBackupAmountsAggregateToTheSameTotals() {
        // Scope: this is a serialization round trip, not a restore. It proves the JSON written by
        // BackupFormat.createBackupJson re-reads to the same cent values, so re-aggregating those
        // rows matches the aggregate of the originals. The Firestore round trip itself (rules,
        // merge/replace/rollback, retries) is covered elsewhere: rel1/rel3/rel6 here and
        // web/emulator/backupRestore.test.ts + restoreRevisionAdversarial.test.ts.
        val json = JSONObject(
            BackupFormat.createBackupJson(
                preferences = BackupFormat.BackupPreferences(currency = fixture.getString("currency"), monthlyBudget = null),
                categories = categories,
                expenses = allExpenses,
                appVersion = "parity",
                exportedAt = "2026-10-01T00:00:00Z",
                categoryBudgets = budgets,
                schemaVersion = 3,
            ),
        )
        val restored = json.getJSONArray("expenses").let { rows ->
            (0 until rows.length()).map { i ->
                val row = rows.getJSONObject(i)
                Expense(
                    id = row.getString("id"),
                    amount = row.getDouble("amount"),
                    dateMillis = row.getLong("dateMillis"),
                    categoryId = row.getString("categoryId"),
                    note = row.getString("note"),
                    transactionType = row.getString("transactionType"),
                )
            }
        }
        val before = buildInsightsState("EUR", categories, liveExpenses, AnalyticsPeriod.ALL_TIME.storageKey, false)
        val after = buildInsightsState("EUR", categories, restored, AnalyticsPeriod.ALL_TIME.storageKey, false)
        assertMoney(before.totalExpenses, after.totalExpenses, "expenses after restore")
        assertMoney(before.totalIncome, after.totalIncome, "income after restore")
        assertMoney(before.totalTransfers, after.totalTransfers, "transfers after restore")
        assertEquals(categoryTotals(before), categoryTotals(after))
    }
}
