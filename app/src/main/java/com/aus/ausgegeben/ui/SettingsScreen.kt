package com.aus.ausgegeben.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.automirrored.rounded.Login
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Euro
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Savings
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.BuildConfig
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.StorageMode
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.cloud.CloudSyncRepository
import com.aus.ausgegeben.notification.ReminderScheduler
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.GroupedSectionLabel
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding
import com.aus.ausgegeben.ui.theme.AppLayoutTokens
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.ui.theme.appDividerColor
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.ExportUtils
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

@Composable
fun SettingsScreen(
    repository: AppRepository,
    preferenceManager: PreferenceManager,
    authRepository: AuthRepository,
    authViewModel: AuthViewModel,
    cloudSyncRepository: CloudSyncRepository,
    storageMode: StorageMode,
    onNavigateToCategories: () -> Unit,
    onShowMessage: (String) -> Unit = {},
    onRequestNotificationPermission: () -> Unit = {},
    onRequestSignIn: () -> Unit = {},
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
    val lastCloudSyncAt by preferenceManager.lastCloudSyncAtFlow.collectAsState(initial = null)

    var showThemeDialog by remember { mutableStateOf(false) }
    var showCurrencyDialog by remember { mutableStateOf(false) }
    var showReminderTimeDialog by remember { mutableStateOf(false) }
    var showBudgetDialog by remember { mutableStateOf(false) }
    var showSignOutDialog by remember { mutableStateOf(false) }

    val signedInEmail = authRepository.currentUserEmail
    val signedInName = authRepository.currentUserDisplayName
    val signedInUserId = authRepository.currentUserId
    val profileLabel = signedInName?.takeIf { it.isNotBlank() }
        ?: signedInEmail?.substringBefore("@")
        ?: stringResource(R.string.settings_account_cloud)

    val lastSyncLabel = remember(lastCloudSyncAt) {
        lastCloudSyncAt?.let { DateFormat.getDateTimeInstance().format(Date(it)) }
    }

    val reminderTimeLabel = remember(reminderHour, reminderMinute) {
        String.format("%02d:%02d", reminderHour, reminderMinute)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        ScreenTitle(
            title = stringResource(R.string.screen_settings),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = tabScreenListBottomPadding()
        ) {
            item { SettingsHeroHeader() }

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

            item { SettingSectionTitle(stringResource(R.string.settings_section_account)) }
            item {
                if (storageMode == StorageMode.CLOUD && signedInUserId != null) {
                    AccountProfileCard(
                        displayName = profileLabel,
                        email = signedInEmail,
                        userId = signedInUserId,
                        lastSyncedLabel = lastSyncLabel,
                        onSyncNow = {
                            scope.launch {
                                cloudSyncRepository.fullSync().fold(
                                    onSuccess = {
                                        preferenceManager.setLastCloudSyncAt(System.currentTimeMillis())
                                        onShowMessage(context.getString(R.string.settings_sync_success))
                                    },
                                    onFailure = {
                                        onShowMessage(context.getString(R.string.settings_sync_failed))
                                    },
                                )
                            }
                        },
                        onSignOut = { showSignOutDialog = true },
                    )
                } else {
                    SettingsGroup {
                        SettingRow(
                            icon = Icons.Rounded.CloudOff,
                            title = stringResource(R.string.settings_account_offline),
                            subtitle = stringResource(R.string.settings_account_offline_subtitle),
                            onClick = null,
                            hasChevron = false,
                        )
                        SettingsDivider()
                        SettingRow(
                            icon = Icons.AutoMirrored.Rounded.Login,
                            title = stringResource(R.string.settings_sign_in),
                            subtitle = stringResource(R.string.settings_sign_in_subtitle),
                            onClick = onRequestSignIn,
                        )
                    }
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

    if (showSignOutDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutDialog = false },
            title = { Text(stringResource(R.string.settings_sign_out)) },
            text = { Text(stringResource(R.string.settings_sign_out_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showSignOutDialog = false
                        authViewModel.signOut {
                            scope.launch {
                                preferenceManager.resetAuthGateway()
                                onShowMessage(context.getString(R.string.settings_signed_out))
                            }
                        }
                    }
                ) {
                    Text(stringResource(R.string.settings_sign_out))
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    if (showThemeDialog) {
        AlertDialog(
            onDismissRequest = { showThemeDialog = false },
            title = { Text(stringResource(R.string.settings_choose_theme)) },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    ThemeMode.entries.forEach { mode ->
                        ThemeOption(
                            label = mode.label(),
                            selected = themeMode == mode,
                            colors = mode.previewColors(),
                        ) {
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant
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
private fun ThemeOption(
    label: String,
    selected: Boolean,
    colors: List<Color> = emptyList(),
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(RoundedCornerShape(AppRadius.xl))
            .background(
                if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.035f)
            )
            .border(
                width = 1.dp,
                color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.36f)
                else MaterialTheme.colorScheme.outline.copy(alpha = 0.12f),
                shape = RoundedCornerShape(AppRadius.xl)
            )
            .clickable(onClick = onClick)
            .padding(vertical = AppSpacing.sm, horizontal = AppSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm)
    ) {
        if (colors.isNotEmpty()) {
            ThemeSwatches(colors = colors)
        }
        Text(
            label,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Normal,
            modifier = Modifier.weight(1f)
        )
        if (selected) {
            Icon(Icons.Rounded.Check, contentDescription = null, tint = IncomeGreen)
        }
    }
}

@Composable
private fun ThemeSwatches(colors: List<Color>) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(AppRadius.pill))
            .background(colors.firstOrNull()?.copy(alpha = 0.18f) ?: Color.Transparent)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        colors.take(4).forEachIndexed { index, color ->
            Box(
                modifier = Modifier
                    .size(if (index == 0) 22.dp else 18.dp)
                    .clip(CircleShape)
                    .background(color)
            )
        }
    }
}

private fun ThemeMode.previewColors(): List<Color> = when (this) {
    ThemeMode.SYSTEM -> listOf(Color(0xFFFAFAFA), Color(0xFF0C0C0E), Color(0xFF8E8E93))
    ThemeMode.LIGHT -> listOf(Color(0xFFFAFAFA), Color(0xFFFFFFFF), Color(0xFF09090B))
    ThemeMode.DARK -> listOf(Color(0xFF0C0C0E), Color(0xFF141416), Color(0xFFFAFAFA))
    ThemeMode.AMOLED -> listOf(Color.Black, Color(0xFF050505), Color.White)
    ThemeMode.MIDNIGHT -> listOf(Color(0xFF070B1A), Color(0xFF17203A), Color(0xFF8AB4FF))
    ThemeMode.OCEAN -> listOf(Color(0xFF061412), Color(0xFF12332F), Color(0xFF56D6C9))
    ThemeMode.FOREST -> listOf(Color(0xFF06130B), Color(0xFF16351F), Color(0xFF86EFAC), Color(0xFFFACC15))
    ThemeMode.SUNSET -> listOf(Color(0xFF190B10), Color(0xFF3B1A23), Color(0xFFFF9F6E), Color(0xFFFFD166))
    ThemeMode.LAVENDER -> listOf(Color(0xFFFCFAFF), Color(0xFFF3EEFF), Color(0xFF7C3AED), Color(0xFFDB2777))
    ThemeMode.SOFT_LIGHT -> listOf(Color(0xFFFAF7F2), Color(0xFFF0E8DC), Color(0xFF7C5E44))
}

@Composable
private fun AccountProfileCard(
    displayName: String,
    email: String?,
    userId: String,
    lastSyncedLabel: String?,
    onSyncNow: () -> Unit,
    onSignOut: () -> Unit,
) {
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val initial = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "A"

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .clip(RoundedCornerShape(AppRadius.xl))
            .background(MaterialTheme.colorScheme.surface)
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.linearGradient(
                        listOf(
                            incomeColor.copy(alpha = 0.14f),
                            MaterialTheme.colorScheme.surface,
                            expenseColor.copy(alpha = 0.1f),
                        ),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(AppSpacing.md),
            verticalArrangement = Arrangement.spacedBy(AppSpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(expenseColor.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initial,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = expenseColor,
                    )
                }
                Spacer(modifier = Modifier.width(AppSpacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                    if (!email.isNullOrBlank()) {
                        Text(
                            text = email,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                    Text(
                        text = stringResource(R.string.settings_user_id, userId.take(8)),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
            ) {
                OutlinedButton(
                    onClick = onSyncNow,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(AppRadius.pill),
                ) {
                    Icon(Icons.Rounded.CloudSync, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(AppSpacing.xs))
                    Text(stringResource(R.string.settings_sync_now))
                }
                OutlinedButton(
                    onClick = onSignOut,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(AppRadius.pill),
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(AppSpacing.xs))
                    Text(stringResource(R.string.settings_sign_out))
                }
            }

            Text(
                text = lastSyncedLabel?.let {
                    stringResource(R.string.settings_last_synced, it)
                } ?: stringResource(R.string.settings_never_synced),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SettingsHeroHeader() {
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .clip(RoundedCornerShape(AppRadius.xl))
            .background(MaterialTheme.colorScheme.surface)
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.linearGradient(
                        listOf(
                            incomeColor.copy(alpha = 0.16f),
                            MaterialTheme.colorScheme.surface,
                            expenseColor.copy(alpha = 0.12f),
                        )
                    )
                )
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(AppSpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(AppRadius.lg))
                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "€",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(modifier = Modifier.width(AppSpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = stringResource(R.string.settings_version_subtitle, BuildConfig.VERSION_NAME),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
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
        modifier = Modifier.padding(start = AppLayoutTokens.listSeparatorInset),
        thickness = 1.dp,
        color = appDividerColor()
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
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                checkedTrackColor = IncomeGreen,
                uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
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
                color = MaterialTheme.colorScheme.onBackground,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = subtitle,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        if (hasChevron) {
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
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
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.size(18.dp)
        )
    }
}
