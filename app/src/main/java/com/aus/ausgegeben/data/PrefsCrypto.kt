package com.aus.ausgegeben.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-GCM via Android Keystore for sensitive preference payloads.
 *
 * Theme/language stay plaintext in DataStore (device chrome). Account-scoped
 * values (budget, currency, sync clocks, reminders, …) are stored as
 * `enc:…` blobs. If the Keystore is unavailable (e.g. some unit-test hosts),
 * values are stored and read as plaintext so the app still functions.
 *
 * Firestore offline cache cannot be app-encrypted by the Firebase SDK;
 * [android:allowBackup=false] and platform file-based encryption remain the
 * mitigations there.
 */
class PrefsCrypto {
    private val secretKey: SecretKey? = runCatching { getOrCreateKey() }.getOrElse { e ->
        Log.w(TAG, "Prefs Keystore unavailable; sensitive prefs stay plaintext", e)
        null
    }

    val encryptionAvailable: Boolean get() = secretKey != null

    fun seal(plain: String): String {
        val key = secretKey ?: return plain
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val ciphertext = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            val packed = ByteBuffer.allocate(4 + iv.size + ciphertext.size)
                .putInt(iv.size)
                .put(iv)
                .put(ciphertext)
                .array()
            PREFIX + Base64.encodeToString(packed, Base64.NO_WRAP)
        }.getOrElse { e ->
            Log.w(TAG, "seal failed; storing plaintext", e)
            plain
        }
    }

    fun open(stored: String?): String? {
        if (stored.isNullOrEmpty()) return stored
        if (!stored.startsWith(PREFIX)) return stored
        val key = secretKey ?: return null
        return runCatching {
            val packed = Base64.decode(stored.removePrefix(PREFIX), Base64.NO_WRAP)
            val buf = ByteBuffer.wrap(packed)
            val ivLen = buf.int
            require(ivLen in 1..64) { "bad iv length" }
            val iv = ByteArray(ivLen).also { buf.get(it) }
            val ciphertext = ByteArray(buf.remaining()).also { buf.get(it) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        }.getOrElse { e ->
            Log.w(TAG, "open failed", e)
            null
        }
    }

    fun sealBoolean(value: Boolean): String = seal(if (value) "1" else "0")

    fun openBoolean(stored: String?, default: Boolean): Boolean =
        when (open(stored)) {
            "1" -> true
            "0" -> false
            else -> default
        }

    fun sealInt(value: Int): String = seal(value.toString())

    fun openInt(stored: String?, default: Int): Int =
        open(stored)?.toIntOrNull() ?: default

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val TAG = "PrefsCrypto"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "ausgegeben_prefs_aes"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val PREFIX = "enc:"
    }
}
