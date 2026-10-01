package com.aus.ausgegeben.util

import android.content.ContentResolver
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.InputStream

object RestoreUtils {
    const val MAX_BACKUP_FILE_BYTES = 10L * 1024L * 1024L // 10 MB

    data class RestoreResult(
        val success: Boolean,
        val expensesRestored: Int,
        val categoriesRestored: Int,
        val preferencesRestored: Boolean,
    )

    sealed interface ReadResult {
        data class Success(
            val backup: BackupFormat.ParsedBackup,
            val summary: BackupFormat.BackupSummary,
        ) : ReadResult

        object FileTooLarge : ReadResult
        object InvalidJson : ReadResult
        data class ValidationError(val errors: List<String>) : ReadResult
        data class IoError(val cause: Throwable) : ReadResult
    }

    /**
     * Reads a backup JSON stream with defensive bounds checking.
     * Enforces a 10 MB file size limit and validates Schema v1 structure before returning.
     */
    fun readAndValidateStream(stream: InputStream): ReadResult {
        val buffer = ByteArray(8192)
        val output = ByteArrayOutputStream()
        var totalBytes = 0L
        var read: Int
        try {
            while (stream.read(buffer).also { read = it } != -1) {
                totalBytes += read
                if (totalBytes > MAX_BACKUP_FILE_BYTES) {
                    return ReadResult.FileTooLarge
                }
                output.write(buffer, 0, read)
            }
        } catch (e: Throwable) {
            return ReadResult.IoError(e)
        }

        val jsonString = try {
            output.toString("UTF-8")
        } catch (e: Throwable) {
            return ReadResult.InvalidJson
        }

        val validation = try {
            BackupFormat.validateBackupJson(jsonString)
        } catch (e: Throwable) {
            return ReadResult.InvalidJson
        }

        if (!validation.valid) {
            if (validation.errors.any { it.startsWith("Invalid JSON") }) {
                return ReadResult.InvalidJson
            }
            return ReadResult.ValidationError(validation.errors)
        }

        val parsed = BackupFormat.parseBackup(jsonString) ?: return ReadResult.InvalidJson
        val summary = BackupFormat.parseBackupSummary(jsonString) ?: return ReadResult.InvalidJson

        return ReadResult.Success(parsed, summary)
    }

    /**
     * Reads a backup JSON file from the provided content URI with defensive bounds checking.
     */
    fun readAndValidateBackupUri(
        contentResolver: ContentResolver,
        uri: Uri,
    ): ReadResult {
        return try {
            val stream = contentResolver.openInputStream(uri)
                ?: return ReadResult.IoError(IllegalStateException("Cannot open input stream for URI: $uri"))
            stream.use { readAndValidateStream(it) }
        } catch (e: Throwable) {
            ReadResult.IoError(e)
        }
    }
}
