package com.aus.ausgegeben.ui



import android.content.Intent

import android.net.Uri

import androidx.compose.foundation.background

import androidx.compose.foundation.clickable

import androidx.compose.foundation.layout.Arrangement

import androidx.compose.foundation.layout.Box

import androidx.compose.foundation.layout.Column

import androidx.compose.foundation.layout.ColumnScope

import androidx.compose.foundation.layout.Row

import androidx.compose.foundation.layout.Spacer

import androidx.compose.foundation.layout.fillMaxSize

import androidx.compose.foundation.layout.fillMaxWidth

import androidx.compose.foundation.layout.height

import androidx.compose.foundation.layout.padding

import androidx.compose.foundation.layout.size

import androidx.compose.foundation.layout.width

import androidx.compose.foundation.lazy.LazyColumn

import androidx.compose.foundation.shape.RoundedCornerShape

import androidx.compose.material.icons.Icons

import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight

import androidx.compose.material.icons.rounded.*

import androidx.compose.material3.*

import androidx.compose.runtime.*

import androidx.compose.ui.Alignment

import androidx.compose.ui.Modifier

import androidx.compose.ui.draw.clip

import androidx.compose.ui.graphics.vector.ImageVector

import androidx.compose.ui.platform.LocalContext

import androidx.compose.ui.res.stringResource

import androidx.compose.ui.text.font.FontWeight

import androidx.compose.ui.unit.dp

import androidx.compose.ui.unit.sp

import com.aus.ausgegeben.BuildConfig
import com.aus.ausgegeben.R

import com.aus.ausgegeben.data.AppRepository

import com.aus.ausgegeben.data.PreferenceManager

import com.aus.ausgegeben.ui.components.GroupedSection

import com.aus.ausgegeben.ui.components.GroupedSectionLabel

import com.aus.ausgegeben.ui.components.ScreenTitle

import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding

import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.CurrencyUtils

import com.aus.ausgegeben.util.ExportUtils

import com.aus.ausgegeben.notification.ReminderScheduler

import kotlinx.coroutines.launch



@Composable

fun SettingsScreen(

    repository: AppRepository,

    preferenceManager: PreferenceManager,

    onNavigateToCategories: () -> Unit,

    onShowMessage: (String) -> Unit = {},

    onRequestNotificationPermission: () -> Unit = {},

    modifier: Modifier = Modifier

) {

    val context = LocalContext.current

    val scope = rememberCoroutineScope()



    val currency by preferenceManager.currencyFlow.collectAsState(initial = "EUR")

    val themeMode by preferenceManager.themeModeFlow.collectAsState(initial = ThemeMode.SYSTEM)

    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsState(initial = true)

    val reminderHour by preferenceManager.reminderHourFlow.collectAsState(initial = 19)

    val reminderMinute by preferenceManager.reminderMinuteFlow.collectAsState(initial = 0)

    val monthlyBudget by preferenceManager.monthlyBudgetFlow.collectAsState(initial = null)

    var showThemeDialog by remember { mutableStateOf(false) }

    var showCurrencyDialog by remember { mutableStateOf(false) }

    var showReminderTimeDialog by remember { mutableStateOf(false) }

    var showBudgetDialog by remember { mutableStateOf(false) }



    val reminderTimeLabel = remember(reminderHour, reminderMinute) {
        String.format("%02d:%02d", reminderHour, reminderMinute)
    }



    Column(

        modifier = modifier.fillMaxSize()

    ) {

        ScreenTitle(
            title = stringResource(R.string.screen_settings),
            subtitle = stringResource(R.string.settings_version_subtitle, BuildConfig.VERSION_NAME)
        )



        LazyColumn(

            modifier = Modifier.fillMaxSize(),

            contentPadding = tabScreenListBottomPadding()

        ) {

                    item { SettingSectionTitle(stringResource(R.string.settings_section_appearance)) }

                    item {

                        SettingsGroup {

                            SettingRow(

                                Icons.Rounded.DarkMode,

                                stringResource(R.string.settings_theme),

                                themeMode.label()

                            ) {

                                showThemeDialog = true

                            }

                            HorizontalDivider(

                                modifier = Modifier.padding(start = 72.dp),

                                thickness = 0.5.dp,

                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)

                            )

                            SettingRow(

                                Icons.Rounded.Euro,

                                stringResource(R.string.settings_currency),

                                CurrencyUtils.labelFor(currency)

                            ) {

                                showCurrencyDialog = true

                            }

                        }

                    }



                    item { SettingSectionTitle(stringResource(R.string.settings_section_notifications)) }

                    item {

                        SettingsGroup {

                            SettingSwitchRow(

                                icon = Icons.Rounded.NotificationsActive,

                                title = stringResource(R.string.settings_evening_reminder),

                                subtitle = stringResource(R.string.settings_reminder_subtitle, reminderTimeLabel),

                                checked = dailyReminder,

                                onCheckedChange = { enabled ->

                                    scope.launch {

                                        preferenceManager.updateDailyReminder(enabled)

                                        if (enabled) {

                                            onRequestNotificationPermission()

                                            ReminderScheduler.scheduleNext(context)

                                            onShowMessage(context.getString(R.string.settings_reminder_enabled))

                                        } else {

                                            ReminderScheduler.cancel(context)

                                            onShowMessage(context.getString(R.string.settings_reminder_disabled))

                                        }

                                    }

                                }

                            )

                            HorizontalDivider(

                                modifier = Modifier.padding(start = 72.dp),

                                thickness = 0.5.dp,

                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)

                            )

                            SettingRow(

                                Icons.Rounded.Schedule,

                                stringResource(R.string.settings_reminder_time),

                                reminderTimeLabel

                            ) {

                                showReminderTimeDialog = true

                            }

                        }

                    }



                    item { SettingSectionTitle(stringResource(R.string.settings_section_budget)) }

                    item {

                        SettingsGroup {

                            SettingRow(

                                Icons.Rounded.Savings,

                                stringResource(R.string.settings_monthly_limit),

                                monthlyBudget?.let { CurrencyUtils.formatAmount(it, currency) }
                                    ?: stringResource(R.string.settings_monthly_limit_not_set)

                            ) {

                                showBudgetDialog = true

                            }

                        }

                    }



                    item { SettingSectionTitle(stringResource(R.string.settings_section_management)) }

                    item {

                        SettingsGroup {

                            SettingRow(

                                Icons.Rounded.Category,

                                stringResource(R.string.settings_categories),

                                stringResource(R.string.settings_categories_subtitle)

                            ) {

                                onNavigateToCategories()

                            }

                        }

                    }



                    item { SettingSectionTitle(stringResource(R.string.settings_section_export)) }

                    item {

                        SettingsGroup {

                            SettingRow(
                                Icons.Rounded.FileDownload,
                                stringResource(R.string.settings_export_csv),
                                stringResource(R.string.settings_export_subtitle)
                            ) {
                                scope.launch {
                                    val ok = ExportUtils.exportCsv(context, repository)
                                    onShowMessage(
                                        context.getString(
                                            if (ok) R.string.settings_export_ok else R.string.settings_export_failed
                                        )
                                    )
                                }
                            }

                        }

                    }



                    item { SettingSectionTitle(stringResource(R.string.settings_section_about)) }

                    item {

                        SettingsGroup {

                            SettingRow(

                                Icons.Rounded.Info,

                                stringResource(R.string.settings_version),

                                BuildConfig.VERSION_NAME,

                                hasChevron = false

                            )

                        }

                    }

                    item {

                        SettingsGroup {

                            SettingRow(
                                Icons.Rounded.SupportAgent,
                                stringResource(R.string.settings_support),
                                "support@ausgegeben.app"
                            ) {

                                val intent = Intent(Intent.ACTION_SENDTO).apply {

                                    data = Uri.parse("mailto:support@ausgegeben.app")

                                }

                                runCatching { context.startActivity(intent) }

                                    .onFailure { onShowMessage(context.getString(R.string.settings_no_email_app)) }

                            }

                        }

                    }

                }

            }

    if (showThemeDialog) {

        AlertDialog(

            onDismissRequest = { showThemeDialog = false },

            title = { Text(stringResource(R.string.settings_choose_theme)) },

            text = {

                Column {

                    ThemeMode.entries.forEach { mode ->

                        ThemeOption(mode.label(), selected = themeMode == mode) {

                            scope.launch {

                                preferenceManager.updateThemeMode(mode)

                                showThemeDialog = false

                            }

                        }

                    }

                }

            },

            confirmButton = {

                TextButton(onClick = { showThemeDialog = false }) { Text(stringResource(R.string.action_close)) }

            }

        )

    }



    if (showCurrencyDialog) {

        AlertDialog(

            onDismissRequest = { showCurrencyDialog = false },

            title = { Text(stringResource(R.string.settings_choose_currency)) },

            text = {

                Column {

                    CurrencyUtils.supportedCurrencies.forEach { code ->

                        ThemeOption(

                            label = CurrencyUtils.labelFor(code),

                            selected = currency == code

                        ) {

                            scope.launch {

                                preferenceManager.updateCurrency(code)

                                showCurrencyDialog = false

                            }

                        }

                    }

                }

            },

            confirmButton = {

                TextButton(onClick = { showCurrencyDialog = false }) { Text(stringResource(R.string.action_close)) }

            }

        )

    }



    if (showReminderTimeDialog) {

        AlertDialog(

            onDismissRequest = { showReminderTimeDialog = false },

            title = { Text(stringResource(R.string.settings_reminder_time)) },

            text = {

                Column {

                    (17..22).forEach { hour ->

                        listOf(0, 30).forEach { minute ->

                            val label = String.format("%02d:%02d", hour, minute)

                            ThemeOption(

                                label = label,

                                selected = reminderHour == hour && reminderMinute == minute

                            ) {

                                scope.launch {

                                    preferenceManager.updateReminderTime(hour, minute)

                                    ReminderScheduler.scheduleNext(context)

                                    showReminderTimeDialog = false

                                    onShowMessage(context.getString(R.string.settings_reminder_set, label))

                                }

                            }

                        }

                    }

                }

            },

            confirmButton = {

                TextButton(onClick = { showReminderTimeDialog = false }) { Text(stringResource(R.string.action_close)) }

            }

        )

    }



    if (showBudgetDialog) {

        var budgetInput by remember(monthlyBudget) {

            mutableStateOf(monthlyBudget?.let { CurrencyUtils.formatAmountForInput(it) } ?: "")

        }

        AlertDialog(

            onDismissRequest = { showBudgetDialog = false },

            title = { Text(stringResource(R.string.settings_budget_dialog_title)) },

            text = {

                Column {

                    Text(

                        stringResource(R.string.settings_budget_dialog_body),

                        style = MaterialTheme.typography.bodySmall,

                        color = MaterialTheme.colorScheme.onSurfaceVariant

                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(

                        value = budgetInput,

                        onValueChange = { budgetInput = it },

                        label = { Text(stringResource(R.string.settings_budget_amount_label, currency)) },

                        singleLine = true

                    )

                }

            },

            confirmButton = {

                TextButton(

                    onClick = {

                        scope.launch {

                            val amount = CurrencyUtils.parseAmount(budgetInput, currency)

                            preferenceManager.updateMonthlyBudget(amount)

                            showBudgetDialog = false

                            onShowMessage(
                                if (amount != null && amount > 0) {
                                    context.getString(R.string.settings_budget_set)
                                } else {
                                    context.getString(R.string.settings_budget_cleared)
                                }
                            )

                        }

                    }

                ) { Text(stringResource(R.string.action_save)) }

            },

            dismissButton = {

                TextButton(onClick = { showBudgetDialog = false }) { Text(stringResource(R.string.action_cancel)) }

            }

        )

    }

}



@Composable

private fun ThemeOption(label: String, selected: Boolean, onClick: () -> Unit) {

    Row(

        modifier = Modifier

            .fillMaxWidth()

            .clip(RoundedCornerShape(8.dp))

            .clickable(onClick = onClick)

            .padding(vertical = 12.dp, horizontal = 8.dp),

        verticalAlignment = Alignment.CenterVertically,

        horizontalArrangement = Arrangement.SpaceBetween

    ) {

        Text(label, color = MaterialTheme.colorScheme.onBackground)

        if (selected) {

            Icon(

                Icons.Rounded.Check,

                contentDescription = null,

                tint = com.aus.ausgegeben.ui.theme.AccentCoral

            )

        }

    }

}



@Composable

fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) {

    GroupedSection(

        modifier = Modifier.padding(vertical = 4.dp),

        content = content

    )

}



@Composable

fun SettingSectionTitle(title: String) {

    GroupedSectionLabel(text = title)

}



@Composable

fun SettingSwitchRow(

    icon: ImageVector,

    title: String,

    subtitle: String,

    checked: Boolean,

    onCheckedChange: (Boolean) -> Unit

) {

    Row(

        modifier = Modifier

            .fillMaxWidth()

            .padding(horizontal = 16.dp, vertical = 6.dp),

        verticalAlignment = Alignment.CenterVertically

    ) {

        Box(

            modifier = Modifier

                .size(40.dp)

                .clip(RoundedCornerShape(8.dp))

                .background(MaterialTheme.colorScheme.surfaceVariant),

            contentAlignment = Alignment.Center

        ) {

            Icon(

                icon,

                contentDescription = title,

                tint = MaterialTheme.colorScheme.onSurface,

                modifier = Modifier.size(20.dp)

            )

        }

        Spacer(modifier = Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {

            Text(

                text = title,

                color = MaterialTheme.colorScheme.onBackground,

                style = MaterialTheme.typography.bodyLarge,

                fontWeight = FontWeight.Medium

            )

            Text(

                text = subtitle,

                color = MaterialTheme.colorScheme.onSurfaceVariant,

                style = MaterialTheme.typography.bodySmall

            )

        }

        Switch(

            checked = checked,

            onCheckedChange = onCheckedChange

        )

    }

}



@Composable

fun SettingRow(

    icon: ImageVector,

    title: String,

    subtitle: String,

    hasChevron: Boolean = true,

    onClick: (() -> Unit)? = null

) {

    Row(

        modifier = Modifier

            .fillMaxWidth()

            .clickable(enabled = onClick != null) { onClick?.invoke() }

            .padding(horizontal = 16.dp, vertical = 10.dp),

        verticalAlignment = Alignment.CenterVertically

    ) {

        Box(

            modifier = Modifier

                .size(40.dp)

                .clip(RoundedCornerShape(8.dp))

                .background(MaterialTheme.colorScheme.surfaceVariant),

            contentAlignment = Alignment.Center

        ) {

            Icon(

                icon,

                contentDescription = title,

                tint = MaterialTheme.colorScheme.onSurface,

                modifier = Modifier.size(20.dp)

            )

        }

        Spacer(modifier = Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {

            Text(

                text = title,

                color = MaterialTheme.colorScheme.onBackground,

                fontSize = 16.sp,

                fontWeight = FontWeight.Medium

            )

            Text(

                text = subtitle,

                color = MaterialTheme.colorScheme.onSurfaceVariant,

                fontSize = 12.sp

            )

        }

        if (hasChevron) {

            Icon(

                Icons.AutoMirrored.Rounded.KeyboardArrowRight,

                contentDescription = null,

                tint = MaterialTheme.colorScheme.outline

            )

        }

    }

}


