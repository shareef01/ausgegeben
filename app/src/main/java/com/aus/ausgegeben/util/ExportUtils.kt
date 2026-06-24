package com.aus.ausgegeben.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.aus.ausgegeben.data.AppRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ExportUtils {
    suspend fun exportCsv(context: Context, repository: AppRepository): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val expenses = repository.allExpenses.first()
                val categories = repository.allCategories.first()
                val categoryById = categories.associateBy { it.id }
                val dateFormat = SimpleDateFormat("yyyy-MM-dd,HH:mm", Locale.US)

                val header = "date,time,type,category,vendor,amount"
                val rows = expenses.map { expense ->
                    val category = categoryById[expense.categoryId]?.name ?: "Unknown"
                    val date = dateFormat.format(Date(expense.dateMillis)).split(",")
                    listOf(
                        date[0],
                        date[1],
                        expense.transactionType,
                        category,
                        expense.note,
                        expense.amount.toString()
                    ).joinToString(",") { csvEscape(it) }
                }

                val file = File(context.cacheDir, "ausgegeben_export.csv")
                file.writeText((listOf(header) + rows).joinToString("\n"))

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
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun csvEscape(value: String): String {
        if (value.none { it == ',' || it == '"' || it == '\n' }) return value
        return "\"${value.replace("\"", "\"\"")}\""
    }
}
