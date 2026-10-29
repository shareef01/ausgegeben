package com.aus.ausgegeben.ui.designqa

import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.platform.app.InstrumentationRegistry
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.ExpenseViewModel
import com.aus.ausgegeben.ui.RecordScreen
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.components.AppFab
import com.aus.ausgegeben.ui.components.MainBottomNavigation
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * The Record tab inside the same scaffold MainActivity uses, under gesture navigation and
 * the 3-button bar. The tabs must sit above the system bar, and the last transaction must
 * scroll clear of the add button. Switching the navigation mode is a system-wide change,
 * so this only runs on an emulator and always puts gestures back afterwards.
 */
@RunWith(Parameterized::class)
class NavigationModeLayoutTest(
    private val navMode: String,
    private val device: QaDevice,
    private val fontScale: Float,
    private val language: String,
) {
    companion object {
        private const val GESTURAL = "com.android.internal.systemui.navbar.gestural"
        private const val THREE_BUTTON = "com.android.internal.systemui.navbar.threebutton"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}-{3}-{1}-x{2}")
        fun matrix(): List<Array<Any>> =
            listOf("gesture", "3button").flatMap { mode ->
                listOf(SmallPhone.copy(heightDp = null), TypicalPhone).flatMap { d ->
                    listOf(arrayOf<Any>(mode, d, 2.0f, "de"), arrayOf<Any>(mode, d, 1.0f, "en"))
                }
            }
    }

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun shell(command: String) {
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
            .use { pfd -> java.io.FileInputStream(pfd.fileDescriptor).readBytes() }
    }

    private fun navBarInsetPx(): Int {
        var inset = 0
        compose.activityRule.scenario.onActivity { activity ->
            val insets = ViewCompat.getRootWindowInsets(activity.window.decorView)
            inset = insets?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0
        }
        return inset
    }

    @Before
    fun setNavMode() {
        assumeTrue("switches the system navigation mode; emulator only", isEmulator())
        shell("cmd overlay enable-exclusive --category ${if (navMode == "3button") THREE_BUTTON else GESTURAL}")
        val threeButtonMinPx = compose.density.run { 40f * density }
        // The bar animates in; wait until the inset reports the new mode.
        compose.waitUntil(10_000) {
            val inset = navBarInsetPx()
            if (navMode == "3button") inset >= threeButtonMinPx else inset in 1 until threeButtonMinPx.toInt()
        }
    }

    @After
    fun restoreGestures() {
        if (isEmulator()) shell("cmd overlay enable-exclusive --category $GESTURAL")
    }

    @Test
    fun tabsSitAboveTheSystemBar_andLastRowClearsTheAddButton() {
        // Draw behind the system bars as MainActivity does. Android 15+ forces it; on the
        // minSdk 29 emulator in CI the window would otherwise stop above the bar.
        compose.activityRule.scenario.onActivity { it.enableEdgeToEdge() }
        val prefs = QaPreferences(DesignQaFixtures.CURRENCY, budget = null)
        compose.setQaContent(device, fontScale, language) {
            val vm = remember {
                ExpenseViewModel(QaCategoryActions(DesignQaFixtures.categories), QaExpenseActions(DesignQaFixtures.expenses), prefs)
            }
            Scaffold(
                containerColor = Color.Transparent,
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                floatingActionButton = {
                    AppFab(onClick = {}, icon = Icons.Rounded.Add, contentDescription = stringResource(R.string.nav_add_transaction))
                },
                bottomBar = { MainBottomNavigation(currentRoute = Route.ExpenseList, onNavigate = {}) },
            ) { padding ->
                Column(Modifier.fillMaxSize().statusBarsPadding().padding(bottom = padding.calculateBottomPadding())) {
                    RecordScreen(viewModel = vm, currencyCode = DesignQaFixtures.CURRENCY)
                }
            }
        }
        val navInset = navBarInsetPx()
        val root = compose.onNodeWithTagRoot()
        val systemBarTop = root.boundsInRoot.bottom - navInset

        val tabs = compose.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)).fetchSemanticsNodes()
        assertTrue("three tabs", tabs.size == 3)
        tabs.forEach { tab ->
            assertTrue(
                "tab ends at ${tab.boundsInRoot.bottom}, system bar starts at $systemBarTop ($navMode)",
                tab.boundsInRoot.bottom <= systemBarTop + 0.5f,
            )
        }

        val shot = "nav-$navMode-$language-${device.name}-x$fontScale"
        compose.saveShot("$shot-top")
        val (problems, _) = compose.scrollAndCheck(shotPrefix = null)
        compose.saveShot("$shot-end")

        // The activity's resources carry the test's language; the app context's do not.
        var addLabel = ""
        compose.activityRule.scenario.onActivity { addLabel = it.resources.getString(R.string.nav_add_transaction) }
        val fabTop = compose.onNodeWithContentDescription(addLabel).fetchSemanticsNode().boundsInRoot.top
        val tabsTop = tabs.minOf { it.boundsInRoot.top }
        val listBottom = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.GetTextLayoutResult))
            .fetchSemanticsNodes()
            .filter { node -> node.boundsInRoot.height > 0f && node.boundsInRoot.bottom < tabsTop }
            .maxOf { it.boundsInRoot.bottom }
        assertTrue("last row ends at $listBottom, under the add button at $fabTop", listBottom <= fabTop)
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
    }

    private fun QaRule.onNodeWithTagRoot() =
        onAllNodes(SemanticsMatcher("root") { it.parent == null }).fetchSemanticsNodes().first()
}
