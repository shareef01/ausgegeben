package com.aus.ausgegeben.data

import org.junit.Assert.assertEquals
import org.junit.Test

class PrefsLwwTest {

    @Test
    fun newerRemoteReplacesLocal() {
        assertEquals(PrefsLwwAction.APPLY_REMOTE, prefsLwwAction(20L, 10L))
    }

    @Test
    fun newerLocalPushes() {
        assertEquals(PrefsLwwAction.PUSH_LOCAL, prefsLwwAction(10L, 20L))
    }

    @Test
    fun equalClocksAreStable() {
        assertEquals(PrefsLwwAction.HOLD, prefsLwwAction(10L, 10L))
    }
}
