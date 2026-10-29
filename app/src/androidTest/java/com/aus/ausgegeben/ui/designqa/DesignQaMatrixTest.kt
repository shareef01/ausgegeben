package com.aus.ausgegeben.ui.designqa

import android.app.Application
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.aus.ausgegeben.data.auth.AuthUser
import com.aus.ausgegeben.ui.AddExpenseViewModel
import com.aus.ausgegeben.ui.AddTransactionScreen
import com.aus.ausgegeben.ui.BillsScreen
import com.aus.ausgegeben.ui.CategoryViewModel
import com.aus.ausgegeben.ui.ExpenseViewModel
import com.aus.ausgegeben.ui.InsightsViewModel
import com.aus.ausgegeben.ui.RecordScreen
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.settings.SettingsAboutSection
import com.aus.ausgegeben.ui.settings.SettingsAccountSection
import com.aus.ausgegeben.ui.settings.SettingsAppearanceSection
import com.aus.ausgegeben.ui.settings.SettingsBudgetSection
import com.aus.ausgegeben.ui.settings.SettingsManagementSection
import com.aus.ausgegeben.ui.settings.SettingsNotificationSection
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.CurrencyUtils
import androidx.compose.ui.res.stringResource
import com.aus.ausgegeben.R
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.io.File

/**
 * Design QA for Android: the main screens with the heavy CHF account, at font scale
 * 1.0 / 1.3 / 2.0, on a 320dp and a 411dp phone, in German and English. No money
 * amount may be ellipsised or clipped, no text may be cut off or pushed off screen,
 * and labels in the same row may not overlap. See docs/design-qa/android.md.
 */
@RunWith(Parameterized::class)
class DesignQaMatrixTest(
    private val device: QaDevice,
    private val fontScale: Float,
    private val language: String,
) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{2}-{0}-x{1}")
        fun matrix(): List<Array<Any>> =
            qaDevicesThatFit().flatMap { d ->
                listOf(1.0f, 1.3f, 2.0f).flatMap { s -> listOf("de", "en").map { arrayOf<Any>(d, s, it) } }
            }
    }

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private val categories = QaCategoryActions(DesignQaFixtures.categories)
    private val expenses = QaExpenseActions(DesignQaFixtures.expenses)
    private val prefs = QaPreferences(DesignQaFixtures.CURRENCY, budget = 150_000.0)

    /** Screenshots for the two corners of the matrix the findings refer to. */
    private val shotPrefix: String?
        get() = when {
            language == "de" && fontScale == 2.0f && device == SmallPhone -> "de-320dp-x2.0"
            language == "en" && fontScale == 1.0f && device == TypicalPhone -> "en-411dp-x1.0"
            else -> null
        }

    private fun check(screen: String) {
        val (problems, notes) = compose.scrollAndCheck(shotPrefix?.let { "$screen-$it" })
        val label = "$screen $language ${device.name} x$fontScale"
        val report = buildString {
            appendLine("## $label")
            problems.forEach { appendLine("- PROBLEM $it") }
            notes.forEach { appendLine("- note $it") }
        }
        Log.i("DesignQa", report)
        val dir = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "design-qa")
        dir.mkdirs()
        File(dir, "report.md").appendText(report)
        assertTrue("$label:\n" + problems.joinToString("\n"), problems.isEmpty())
    }

    @Test
    fun record() {
        compose.setQaContent(device, fontScale, language) {
            val vm = remember { ExpenseViewModel(categories, expenses, prefs) }
            RecordScreen(viewModel = vm, currencyCode = DesignQaFixtures.CURRENCY)
        }
        check("record")
    }

    @Test
    fun insights() {
        compose.setQaContent(device, fontScale, language) {
            val vm = remember { InsightsViewModel(categories, expenses, prefs) }
            BillsScreen(viewModel = vm, currencyCode = DesignQaFixtures.CURRENCY)
        }
        check("insights")
    }

    @Test
    fun addTransaction() {
        val vm = AddExpenseViewModel(app, categories, expenses, prefs)
        compose.setQaContent(device, fontScale, language) {
            val categoryVm = remember { CategoryViewModel(app, categories) }
            AddTransactionScreen(
                viewModel = vm,
                categoryViewModel = categoryVm,
                currencyCode = DesignQaFixtures.CURRENCY,
                onTransactionSaved = {},
                onBack = {},
                onValidationError = {},
            )
        }
        val sep = CurrencyUtils.decimalSeparator(DesignQaFixtures.CURRENCY)
        compose.runOnIdle {
            vm.onAmountChange("1104064${sep}70")
            vm.onCategorySelect(DesignQaFixtures.categories.first())
        }
        check("add")
    }

    @Test
    fun settings() {
        compose.setQaContent(device, fontScale, language) {
            LazyColumn {
                item { ScreenTitle(title = stringResource(R.string.screen_settings)) }
                item {
                    SettingsAccountSection(
                        currentUser = AuthUser("qa", "qa-heavy@ausgegeben.test", "Maximilian Mustermann-Schneider", true),
                        syncing = false,
                        lastCloudSyncAt = System.currentTimeMillis(),
                        onRetrySync = {},
                        onRequestSignIn = {},
                    )
                }
                item {
                    SettingsAppearanceSection(
                        themeMode = ThemeMode.SYSTEM,
                        language = language,
                        currency = DesignQaFixtures.CURRENCY,
                        onShowThemeSheet = {}, onShowLanguageSheet = {}, onShowCurrencySheet = {},
                    )
                }
                item { SettingsBudgetSection(monthlyBudget = 1_104_064.70, currency = DesignQaFixtures.CURRENCY, onShowBudgetDialog = {}) }
                item { SettingsNotificationSection(dailyReminder = true, reminderTimeLabel = "19:00", onDailyReminderChange = {}, onShowReminderTimeDialog = {}) }
                item { SettingsManagementSection({}, {}, {}, {}, {}, {}) }
                item { SettingsAboutSection(onSupportUnavailable = {}) }
            }
        }
        check("settings")
    }
}
