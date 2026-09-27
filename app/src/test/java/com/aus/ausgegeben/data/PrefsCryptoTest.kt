package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29])
class PrefsCryptoTest {

    @Test
    fun sealOpen_roundTripsPlainOrEncrypted() {
        val crypto = PrefsCrypto()
        val sealed = crypto.seal("42.5")
        assertEquals("42.5", crypto.open(sealed))
        assertEquals(true, crypto.openBoolean(crypto.sealBoolean(true), false))
        assertEquals(19, crypto.openInt(crypto.sealInt(19), 0))
    }

    @Test
    fun open_preservesLegacyPlaintext() {
        val crypto = PrefsCrypto()
        assertEquals("EUR", crypto.open("EUR"))
        assertFalse("EUR".startsWith(PrefsCrypto.PREFIX))
    }

    @Test
    fun seal_marksEncryptedPayloadWhenKeystoreWorks() {
        val crypto = PrefsCrypto()
        val sealed = crypto.seal("secret-budget")
        if (crypto.encryptionAvailable) {
            assertTrue(sealed.startsWith(PrefsCrypto.PREFIX))
            assertEquals("secret-budget", crypto.open(sealed))
        } else {
            assertEquals("secret-budget", sealed)
        }
    }

    // STOR-2: strict open distinguishes "value absent" from "value present but
    // unreadable", so callers that REWRITE values (cloud preference sync) can refuse
    // instead of pushing a defaulted value over the user's real data.
    @Test
    fun openStrict_passesThroughAbsentAndLegacyPlaintextValues() {
        val crypto = PrefsCrypto()
        assertNull(crypto.openStrict(null))
        assertEquals("", crypto.openStrict(""))
        assertEquals("EUR", crypto.openStrict("EUR"))
    }

    @Test
    fun openStrict_throws_whenSealedValueIsPresentButUnreadable() {
        val crypto = PrefsCrypto()
        // On a test host the Keystore is unavailable, so ANY enc: blob is unreadable;
        // on a production device this models corrupted ciphertext or a lost key —
        // either way the strict contract is the same: throw, never silently default.
        assertThrows(PrefsCrypto.SealedValueUnreadableException::class.java) {
            crypto.openStrict("enc:not-valid-ciphertext")
        }
        assertThrows(PrefsCrypto.SealedValueUnreadableException::class.java) {
            crypto.openBooleanStrict("enc:not-valid-ciphertext", true)
        }
        assertThrows(PrefsCrypto.SealedValueUnreadableException::class.java) {
            crypto.openIntStrict("enc:not-valid-ciphertext", 0)
        }
    }

    @Test
    fun openBooleanAndIntStrict_defaultOnAbsentValues() {
        val crypto = PrefsCrypto()
        assertTrue(crypto.openBooleanStrict(null, true))
        assertEquals(19, crypto.openIntStrict(null, 19))
    }
}
