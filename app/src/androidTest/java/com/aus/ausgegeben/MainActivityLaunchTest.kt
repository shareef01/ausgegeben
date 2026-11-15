package com.aus.ausgegeben

import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityLaunchTest {

    /**
     * AUD-007: the Record, Insights and Recurring ViewModels are created through Hilt from
     * a per-account store (AccountViewModelStores), and that store lives in a holder in the
     * Activity's store so it survives recreation. Recreate after the first frame and make
     * sure both compositions build those ViewModels without crashing.
     */
    @Test
    fun mainActivity_survivesRecreation_withAccountScopedViewModels() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            scenario.recreate()
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            scenario.onActivity { activity ->
                check(!activity.isFinishing)
            }
        }
    }

    @Test
    fun mainActivity_launchesWithoutCrashing() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                check(!activity.isFinishing)
            }
        }
    }
}
