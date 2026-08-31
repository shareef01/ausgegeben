package com.aus.ausgegeben.util

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Loads testdata/money-parity.json (same file as web/src/utils/moneyParity.test.ts).
 */
class MoneyParityTest {

    private val fixture: JSONObject = JSONObject(
        checkNotNull(javaClass.classLoader!!.getResourceAsStream("money-parity.json"))
            .bufferedReader()
            .use { it.readText() },
    )

    @Test
    fun display_matchesWebLanguageRule() {
        val rows = fixture.getJSONArray("display")
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            assertEquals(
                row.getString("formatted"),
                CurrencyUtils.formatAmount(
                    row.getDouble("amount"),
                    row.getString("currency"),
                    showSymbol = row.getBoolean("showSymbol"),
                    language = row.getString("language"),
                ),
            )
        }
    }

    @Test
    fun parse_matchesWebVectors() {
        val rows = fixture.getJSONArray("parse")
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            assertEquals(
                row.getDouble("value"),
                CurrencyUtils.parseAmount(row.getString("input"), row.getString("currency"))!!,
                0.001,
            )
        }
    }

    @Test
    fun csv_matchesWebTwoDecimalCells() {
        val rows = fixture.getJSONArray("csv")
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            assertEquals(row.getString("cell"), ExportUtils.formatAmountCell(row.getDouble("amount")))
        }
    }
    /**
     * Edit-form prefill. This used DecimalFormat("0.##"), which drops trailing zeros, so
     * a stored 12.50 prefilled "12,5" here and "12,50" on web -- the same transaction
     * shown differently depending on which client opened it. Both re-parsed correctly, so
     * nothing was miscalculated; it was a visible parity gap.
     */
    @Test
    fun inputPrefill_matchesWebFormatAmountForInput() {
        val rows = fixture.getJSONArray("input")
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            assertEquals(
                row.getString("text"),
                CurrencyUtils.formatAmountForInput(row.getDouble("amount"), row.getString("currency")),
            )
        }
    }
}
