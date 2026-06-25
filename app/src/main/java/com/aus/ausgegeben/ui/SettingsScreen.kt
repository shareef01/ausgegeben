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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Euro
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Savings
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.BuildConfig
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.notification.ReminderScheduler
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.GroupedSectionLabel
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.ExportUtils
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
        modifier = modifier
            .fillMaxSize()
            .background(AppColors.Background)
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
                        icon = Icons.Rounded.DarkMode,
                        title = stringResource(R.string.settings_theme),
                        subtitle = themeMode.label(),
                        onClick = { showThemeDialog = true }
                    )
                    SettingsDivider()
                    SettingRow(
                        icon = Icons.Rounded.Euro,
                        title = stringResource(R.string.settings_currency),
                        subtitle = CurrencyUtils.labelFor(currency),
                        onClick = { showCurrencyDialog = true }
                    )
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
                    SettingsDivider()
                    SettingRow(
                        icon = Icons.Rounded.Schedule,
                        title = stringResource(R.string.settings_reminder_time),
                        subtitle = reminderTimeLabel,
                        onClick = { showReminderTimeDialog = true }
                    )
                }
            }

            item { SettingSectionTitle(stringResource(R.string.settings_section_budget)) }
            item {
                SettingsGroup {
                    SettingRow(
                        icon = Icons.Rounded.Savings,
                        title = stringResource(R.string.settings_monthly_limit),
                        subtitle = monthlyBudget?.let { CurrencyUtils.formatAmount(it, currency) }
                            ?: stringResource(R.string.settings_monthly_limit_not_set),
                        onClick = { showBudgetDialog = true }
                    )
                }
            }

            item { SettingSectionTitle(stringResource(R.string.settings_section_management)) }
            item {
                SettingsGroup {
                    SettingRow(
                        icon = Icons.Rounded.Category,
                        title = stringResource(R.string.settings_categories),
                        subtitle = stringResource(R.string.settings_categories_subtitle),
                        onClick = onNavigateToCategories
                    )
                }
            }

            item { SettingSectionTitle(stringResource(R.string.settings_section_export)) }
            item {
                SettingsGroup {
                    SettingRow(
                        icon = Icons.Rounded.FileDownload,
                        title = stringResource(R.string.settings_export_csv),
                        subtitle = stringResource(R.string.settings_export_subtitle),
                        onClick = {
                            scope.launch {
                                val ok = ExportUtils.exportCsv(context, repository)
                                onShowMessage(
                                    context.getString(
                                        if (ok) R.string.settings_export_ok else R.string.settings_export_failed
                                    )
                                )
                            }
                        }
                    )
                }
            }

            item { SettingSectionTitle(stringResource(R.string.settings_section_about)) }
            item {
                SettingsGroup {
                    SettingRow(
                        icon = Icons.Rounded.Info,
                        title = stringResource(R.string.settings_version),
                        subtitle = BuildConfig.VERSION_NAME,
                        hasChevron = false,
                        onClick = null
                    )
                }
            }
            item {
                SettingsGroup {
                    SettingRow(
                        icon = Icons.Rounded.SupportAgent,
                        title = stringResource(R.string.settings_support),
                        subtitle = "support@ausgegeben.app",
                        onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:support@ausgegeben.app")
                            }
                            runCatching { context.startActivity(intent) }
                                .onFailure { onShowMessage(context.getString(R.string.settings_no_email_app)) }
                        }
                    )
                }
            }
        }
    }

    if (showThemeDialog) {
        AlertDialog(
            onDismissRequest = { showThemeDialog = false },
            title = { Text(stringResource(R.string.settings_choose_theme)) },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
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
                TextButton(onClick = { showThemeDialog = false }) {
                    Text(stringResource(R.string.action_close))
                }
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
                TextButton(onClick = { showCurrencyDialog = false }) {
                    Text(stringResource(R.string.action_close))
                }
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
                TextButton(onClick = { showReminderTimeDialog = false }) {
                    Text(stringResource(R.string.action_close))
                }
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
                        color = AppColors.OnSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(AppSpacing.sm))
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
                TextButton(onClick = { showBudgetDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@Composable
private fun ThemeOption(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadius.sm))
            .clickable(onClick = onClick)
            .padding(vertical = AppSpacing.sm, horizontal = AppSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = AppColors.OnBackground)
        if (selected) {
            Icon(Icons.Rounded.Check, contentDescription = null, tint = AppColors.Income)
        }
    }
}

@Composable
fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) {
    GroupedSection(
        modifier = Modifier.padding(vertical = AppSpacing.xxs),
        content = content
    )
}

@Composable
fun SettingSectionTitle(title: String) {
    GroupedSectionLabel(text = title)
}

@Composable
private fun SettingsDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(start = 64.dp),
        thickness = 1.dp,
        color = AppColors.CardBorder
    )
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
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SettingIconWell(icon = icon, contentDescription = title)
        Spacer(modifier = Modifier.width(AppSpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = AppColors.OnBackground,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = subtitle,
                color = AppColors.OnSurfaceVariant,
                style = MaterialTheme.typography.bodySmall
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = AppColors.OnBackground,
                checkedTrackColor = AppColors.Income,
                uncheckedThumbColor = AppColors.OnSurfaceVariant,
                uncheckedTrackColor = AppColors.CardSurface
            )
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
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm + AppSpacing.xxs),
        verticalAlignment = Alignment.CenterVertically
    ) {
        SettingIconWell(icon = icon, contentDescription = title)
        Spacer(modifier = Modifier.width(AppSpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = AppColors.OnBackground,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = subtitle,
                color = AppColors.OnSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        if (hasChevron) {
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = AppColors.OnSurfaceVariant
            )
        }
    }
}

@Composable
private fun SettingIconWell(icon: ImageVector, contentDescription: String) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(AppRadius.sm + AppSpacing.xxs))
            .background(AppColors.NumpadPress),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = AppColors.OnBackground,
            modifier = Modifier.size(18.dp)
        )
    }
}
