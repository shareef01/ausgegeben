package com.aus.ausgegeben.util

import android.content.Context
import android.net.Uri
import java.io.File

object ReceiptFileUtils {

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
