package com.aus.ausgegeben.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountSwitchPolicyTest {
    @Test
    fun shouldClearLocalDataBeforeSync_matchesWebPolicy() {
        assertFalse(shouldClearLocalDataBeforeSync(null, "uid-a"))
        assertFalse(shouldClearLocalDataBeforeSync("", "uid-a"))
        assertFalse(shouldClearLocalDataBeforeSync("uid-a", "uid-a"))
        assertTrue(shouldClearLocalDataBeforeSync("uid-a", "uid-b"))
    }
}
