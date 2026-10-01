package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream

class RestoreUtilsTest {

    private val sampleCategories = listOf(
        Category(
            id = "cat-groceries",
            name = "Groceries",
            iconName = "shopping-cart",
            colorInt = -65536,
            transactionType = "expense",
            sortOrder = 1,
        )
    )

    private val sampleExpenses = listOf(
        Expense(
            id = "exp-1",
            amount = 35.5,
            dateMillis = 1700000000000L,
            categoryId = "cat-groceries",
            note = "Groceries",
            transactionType = "expense",
        )
    )

    @Test
    fun readAndValidateStream_validBackup_returnsSuccess() {
        val json = BackupFormat.createBackupJson(
            preferences = BackupFormat.BackupPreferences("EUR", 1000.0),
            categories = sampleCategories,
            expenses = sampleExpenses,
            appVersion = "2.0.8",
        )

        val stream = ByteArrayInputStream(json.toByteArray(Charsets.UTF_8))
        val result = RestoreUtils.readAndValidateStream(stream)

        assertTrue(result is RestoreUtils.ReadResult.Success)
        val success = result as RestoreUtils.ReadResult.Success
        assertEquals(1, success.summary.expenseCount)
        assertEquals(1, success.summary.categoryCount)
        assertEquals("EUR", success.summary.currency)
        assertEquals(1000.0, success.summary.monthlyBudget!!, 0.001)
        assertEquals(1, success.backup.expenses.size)
        assertEquals("exp-1", success.backup.expenses[0].id)
    }

    @Test
    fun readAndValidateStream_exceedsMaxSize_returnsFileTooLarge() {
        // Generates 10 MB + 1 byte
        val targetSize = RestoreUtils.MAX_BACKUP_FILE_BYTES + 1
        val largeStream = object : InputStream() {
            var bytesGenerated = 0L
            override fun read(): Int {
                if (bytesGenerated >= targetSize) return -1
                bytesGenerated++
                return '{'.code
            }

            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (bytesGenerated >= targetSize) return -1
                val available = (targetSize - bytesGenerated).coerceAtMost(len.toLong()).toInt()
                b.fill('{'.code.toByte(), off, off + available)
                bytesGenerated += available
                return available
            }
        }

        val result = RestoreUtils.readAndValidateStream(largeStream)
        assertTrue(result is RestoreUtils.ReadResult.FileTooLarge)
    }

    @Test
    fun readAndValidateStream_invalidJson_returnsInvalidJson() {
        val stream = ByteArrayInputStream("not json at all".toByteArray(Charsets.UTF_8))
        val result = RestoreUtils.readAndValidateStream(stream)
        assertTrue(result is RestoreUtils.ReadResult.InvalidJson)
    }

    @Test
    fun readAndValidateStream_validationFailure_returnsValidationError() {
        val invalidCategoryRefJson = """
            {
              "format": "ausgegeben-backup",
              "schemaVersion": 1,
              "appVersion": "2.0.8",
              "exportedAt": "2026-10-01T00:00:00Z",
              "preferences": { "currency": "EUR" },
              "categories": [
                {
                  "id": "cat-food",
                  "name": "Food",
                  "iconName": "restaurant",
                  "colorInt": -1,
                  "transactionType": "expense",
                  "sortOrder": 1
                }
              ],
              "expenses": [
                {
                  "id": "exp-orphan",
                  "amount": 10.0,
                  "dateMillis": 1700000000000,
                  "categoryId": "cat-missing",
                  "note": "orphan",
                  "transactionType": "expense"
                }
              ]
            }
        """.trimIndent()

        val stream = ByteArrayInputStream(invalidCategoryRefJson.toByteArray(Charsets.UTF_8))
        val result = RestoreUtils.readAndValidateStream(stream)
        assertTrue(result is RestoreUtils.ReadResult.ValidationError)
        val validation = result as RestoreUtils.ReadResult.ValidationError
        assertTrue(validation.errors.any { it.contains("references nonexistent categoryId") })
    }

    @Test
    fun readAndValidateStream_ioError_returnsIoError() {
        val failingStream = object : InputStream() {
            override fun read(): Int = throw IOException("Simulated disk error")
        }
        val result = RestoreUtils.readAndValidateStream(failingStream)
        assertTrue(result is RestoreUtils.ReadResult.IoError)
    }
}
