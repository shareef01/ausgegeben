package com.aus.ausgegeben.data.cloud

import android.content.Context
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageException
import kotlinx.coroutines.tasks.await

/**
 * Uploads/downloads receipt images to Firebase Storage.
 *
 * All operations are best-effort: receipts are an optional convenience and must never
 * break the core data sync. If a Storage bucket is not provisioned (e.g. the project is
 * on the free Spark plan), cloud receipts are disabled for the session and everything
 * keeps working locally.
 */
class ReceiptStorageService(
    private val authRepository: AuthRepository,
    private val appContext: Context,
    storageFactory: () -> FirebaseStorage? = { runCatching { FirebaseStorage.getInstance() }.getOrNull() },
) {
    private val storage: FirebaseStorage? = runCatching { storageFactory() }.getOrNull()

    @Volatile
    private var cloudUnavailable = false

    private fun storagePath(uid: String, receiptId: String) =
        "users/$uid/receipts/$receiptId"

    private fun noteFailure(error: Throwable) {
        val code = (error as? StorageException)?.errorCode
        if (code == StorageException.ERROR_BUCKET_NOT_FOUND ||
            code == StorageException.ERROR_PROJECT_NOT_FOUND
        ) {
            cloudUnavailable = true
        }
    }

    suspend fun upload(path: String?) {
        if (cloudUnavailable) return
        if (!ReceiptFileUtils.isReceiptPath(path)) return
        val storageRef = storage ?: return
        val uid = authRepository.currentUserId ?: return
        val receiptId = ReceiptFileUtils.receiptIdFromPath(path!!)
        val file = ReceiptFileUtils.localFileForReceipt(appContext, receiptId)
        if (!file.exists()) return
        runCatching {
            storageRef.reference
                .child(storagePath(uid, receiptId))
                .putFile(android.net.Uri.fromFile(file))
                .await()
        }.onFailure(::noteFailure)
    }

    suspend fun download(path: String?) {
        if (cloudUnavailable) return
        if (!ReceiptFileUtils.isReceiptPath(path)) return
        val storageRef = storage ?: return
        val uid = authRepository.currentUserId ?: return
        val receiptId = ReceiptFileUtils.receiptIdFromPath(path!!)
        val file = ReceiptFileUtils.localFileForReceipt(appContext, receiptId)
        if (file.exists()) return
        file.parentFile?.mkdirs()
        runCatching {
            storageRef.reference
                .child(storagePath(uid, receiptId))
                .getFile(file)
                .await()
        }.onFailure(::noteFailure)
    }

    suspend fun delete(path: String?) {
        if (cloudUnavailable) return
        if (!ReceiptFileUtils.isReceiptPath(path)) return
        val storageRef = storage ?: return
        val uid = authRepository.currentUserId ?: return
        val receiptId = ReceiptFileUtils.receiptIdFromPath(path!!)
        runCatching {
            storageRef.reference.child(storagePath(uid, receiptId)).delete().await()
        }.onFailure(::noteFailure)
    }
}
