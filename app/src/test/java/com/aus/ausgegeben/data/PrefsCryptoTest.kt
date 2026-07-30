package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
