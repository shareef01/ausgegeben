package com.aus.ausgegeben.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReceiptFileUtils {

    private const val RECEIPT_DIR_NAME = "receipts"
    private const val MAX_RECEIPT_SIZE_BYTES = 10L * 1024 * 1024

    fun receiptOutputDirectory(context: Context): File =
        File(context.filesDir, RECEIPT_DIR_NAME).apply { mkdirs() }

    fun getUriSize(context: Context, uri: Uri): Long {
        if (uri.scheme == "file") {
            return uri.path?.let { File(it).length() } ?: 0L
        }
        return context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIndex >= 0 && cursor.moveToFirst()) cursor.getLong(sizeIndex) else 0L
        } ?: 0L
    }

    fun isReceiptValid(context: Context, uri: Uri): Boolean {
        val size = getUriSize(context, uri)
        return size in 1..MAX_RECEIPT_SIZE_BYTES
    }

    fun copyReceipt(context: Context, sourcePath: String?): String? {
        if (sourcePath.isNullOrBlank()) return null
        val sourceUri = Uri.parse(sourcePath)
        val outputDir = receiptOutputDirectory(context)
        val timestamp = SimpleDateFormat("yyyy-MM-dd-HH-mm-ss-SSS", Locale.US).format(Date())
        val destFile = File(outputDir, "receipt-$timestamp.jpg")
        val copied = runCatching {
            when (sourceUri.scheme) {
                "file" -> {
                    val sourceFile = sourceUri.path?.let(::File) ?: return null
                    if (!sourceFile.exists()) return null
                    sourceFile.copyTo(destFile, overwrite = true)
                }
                else -> {
                    context.contentResolver.openInputStream(sourceUri)?.use { input ->
                        destFile.outputStream().use { output -> input.copyTo(output) }
                    } ?: return null
                }
            }
        }.isSuccess
        if (!copied || !destFile.exists()) return null
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            destFile
        ).toString()
    }

    fun deleteIfStored(context: Context, path: String?) {
        if (path.isNullOrBlank()) return
        runCatching {
            val uri = Uri.parse(path)
            when (uri.scheme) {
                "file" -> uri.path?.let { File(it).delete() }
                "content" -> context.contentResolver.delete(uri, null, null)
            }
        }
    }
}
