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
 * `enc:…` blobs.
 *
 * ## Fail-open behavior (STOR-2) — documented downgrade, not an accident
 *
 * If sealing is impossible, values are stored and read as plaintext so the app still
 * works. This is a deliberate availability-over-confidentiality trade-off: failing
 * closed here would brick preference access — and with it app start — for any user
 * whose Keystore became temporarily unavailable (some devices return errors for the
 * Keystore while the user has not yet unlocked the device after a reboot).
 *
 * The three downgrade cases, and what each means:
 *
 * 1. **Keystore unavailable** (this `secretKey` stays null). EXPECTED on unit-test
 *    hosts (Robolectric has no Android Keystore) and harmless there — nothing sensitive
 *    is persisted for real. On a production device this is a real degradation: sealed
 *    values written earlier can no longer be decrypted ([open] returns null for them)
 *    and new values are written as plaintext. Both are reported at ERROR level on a
 *    real device, WARNING level under a test host.
 * 2. **Cipher failure during [seal]** — logged, value stored as plaintext. The next
 *    successful write of the same key re-seals it.
 * 3. **Decrypt failure during [open]** — logged, returns null. Callers substitute
 *    their documented default for display; the undecryptable blob itself is left
 *    untouched on disk.
 *
 * Because of (1)–(3), a value WITHOUT the `enc:` prefix is always passed through
 * unchanged by [open] — it may be legacy plaintext or a documented downgrade. Callers
 * that would REWRITE a defaulted value elsewhere (cloud preference sync) must use the
 * strict variants instead: substituting a default for an unreadable value and pushing
 * it to the cloud would silently destroy the user's real synced data. See
 * [openStrict] and [SealedValueUnreadableException].
 *
 * Firestore offline cache cannot be app-encrypted by the Firebase SDK;
 * [android:allowBackup=false] and platform file-based encryption remain the
 * mitigations there.
 */
class PrefsCrypto {
    private val secretKey: SecretKey? = runCatching { getOrCreateKey() }.getOrElse { e ->
        val message = "Prefs Keystore unavailable; sensitive prefs stay plaintext"
        if (isTestHost) Log.w(TAG, message, e) else Log.e(TAG, message, e)
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

    /**
     * Like [open], but distinguishes "value absent" from "value present but unreadable":
     * returns null only for a null/empty [stored], passes non-sealed values through
     * unchanged (legacy plaintext or a documented downgrade), and throws
     * [SealedValueUnreadableException] when an `enc:` blob exists but cannot be
     * decrypted — either the ciphertext is corrupted or the Keystore key that produced
     * it is gone.
     *
     * Callers that would REWRITE a defaulted value elsewhere (e.g. cloud preference
     * sync) must use this instead of [open]: substituting a default for an unreadable
     * value and writing it back would silently destroy the user's real data (STOR-2).
     */
    fun openStrict(stored: String?): String? {
        if (stored.isNullOrEmpty()) return stored
        if (!stored.startsWith(PREFIX)) return stored
        return open(stored) ?: throw SealedValueUnreadableException()
    }

    fun openIntStrict(stored: String?, default: Int): Int =
        openStrict(stored)?.toIntOrNull() ?: default

    /** A sealed value exists but cannot be decrypted — see [openStrict]. */
    class SealedValueUnreadableException : IllegalStateException(
        "sealed preference value is present but cannot be decrypted",
    )

    fun openBooleanStrict(stored: String?, default: Boolean): Boolean =
        when (openStrict(stored)) {
            "1" -> true
            "0" -> false
            // null (absent), "" and any legacy plaintext that is not 0/1 fall back to
            // the default, exactly like [openBoolean]; only an unreadable `enc:` blob
            // throws (inside [openStrict]).
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

    /** Robolectric/unit-test hosts have no Android Keystore; there the downgrade is expected. */
    private val isTestHost: Boolean
        get() = android.os.Build.FINGERPRINT?.startsWith("robolectric", ignoreCase = true) == true

    companion object {
        private const val TAG = "PrefsCrypto"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "ausgegeben_prefs_aes"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val PREFIX = "enc:"
    }
}
