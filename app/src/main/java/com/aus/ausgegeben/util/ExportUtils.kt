package com.aus.ausgegeben.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ExportUtils {
    data class Result(
        val success: Boolean,
        val truncated: Boolean = false,
        /** True when the export hit the soft cap and [allowTruncated] was false. */
        val needsConfirm: Boolean = false,
    )

    /**
     * Build and share a CSV of expenses. When the soft cap truncates history and
     * [allowTruncated] is false, returns [Result.needsConfirm] without opening the share sheet.
     */
    suspend fun exportCsv(
        context: Context,
        repository: AppRepository,
        allowTruncated: Boolean = false,
    ): Result {
        return withContext(Dispatchers.IO) {
            try {
                val expenses = repository.allExpenses.first()
                // Read after collecting, so the listener has already reported whether it
                // hit the cap. expenses.size can't tell a complete cap-sized result apart
                // from a truncated one.
                val truncated = repository.dataTruncated.value
                if (truncated && !allowTruncated) {
                    return@withContext Result(success = false, truncated = true, needsConfirm = true)
                }
                val categories = repository.allCategories.first()
                val categoryById = categories.associateBy { it.id }
                val dateFormat = SimpleDateFormat("yyyy-MM-dd,HH:mm", Locale.US)

                // Local wall-clock date/time with no offset column — matches web exportCsv
                // and the app's local-calendar month buckets (AUS-025).
                val header = "date,time,type,category,note,amount"
                val unknownLabel = context.getString(R.string.record_unknown_category)
                val rows = expenses.map { expense ->
                    val category = categoryById[expense.categoryId]?.name ?: unknownLabel
                    val date = dateFormat.format(Date(expense.dateMillis)).split(",")
                    listOf(
                        date[0],
                        date[1],
                        expense.transactionType,
                        category,
                        expense.note,
                        formatAmountCell(expense.amount)
                    ).joinToString(",") { csvEscape(it) }
                }

                val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
                // Drop anything a previous export left behind before writing. The file
                // name is fixed and nothing ever deleted it, so a full copy of the user's
                // financial history sat in the cache directory indefinitely after a single
                // share. App-private and allowBackup=false, so this is data residency
                // rather than exposure -- but a finance app should not keep a plaintext
                // export around for no reason.
                exportDir.listFiles()?.forEach { runCatching { it.delete() } }
                val file = File(exportDir, "ausgegeben_export.csv")
                // U+FEFF so Excel on Windows reads the file as UTF-8. Without it Excel
                // assumes the system ANSI code page and mangles every umlaut, which
                // matters because German is a first-class locale here. Written at the
                // file layer, not into the row builder, so the CSV parity tests keep
                // asserting exact bytes against the web client.
                file.writeText("\uFEFF" + (listOf(header) + rows).joinToString("\n"))

                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file
                )
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/csv"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                withContext(Dispatchers.Main) {
                    context.startActivity(Intent.createChooser(intent, "Export CSV"))
                }
                Result(success = true, truncated = truncated)
            } catch (_: Exception) {
                Result(success = false)
            }
        }
    }

    private fun csvEscape(value: String): String = csvEscapeField(value)

    /**
     * Two decimals rather than [Double.toString], which renders 5.0 as "5.0" and 1e9 as
     * "1.0E9" where the web client's `String(amount)` renders "5" and "1000000000" — the
     * same expense exported differently depending on which client produced the file.
     * [Locale.US] keeps the separator a dot on every device, matching the web output.
     * Kept internal so the parity contract is asserted directly rather than through
     * exportCsv, which needs a Context and a repository.
     */
    internal fun formatAmountCell(amount: Double): String =
        String.format(Locale.US, "%.2f", amount)

    internal fun csvEscapeField(value: String): String {
        // Neutralize spreadsheet formula triggers (=, +, -, @, tab, CR) so a
        // malicious note can't execute when the CSV is opened in Excel/Sheets.
        val safe = if (value.isNotEmpty() && value[0] in FORMULA_TRIGGERS) "'$value" else value
        if (safe.none { it == ',' || it == '"' || it == '\n' || it == '\r' }) return safe
        return "\"${safe.replace("\"", "\"\"")}\""
    }

    private val FORMULA_TRIGGERS = charArrayOf('=', '+', '-', '@', '\t', '\r')
}
