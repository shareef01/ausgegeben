package com.aus.ausgegeben.ui

import android.content.Intent
import android.net.Uri
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Help
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.ExportUtils
import com.aus.ausgegeben.notification.ReminderScheduler
import com.aus.ausgegeben.util.formatRelativeTimestamp
import com.aus.ausgegeben.util.rememberAppHaptics
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    repository: AppRepository,
    preferenceManager: PreferenceManager,
    authRepository: AuthRepository,
    authViewModel: AuthViewModel,
    syncError: String? = null,
    syncing: Boolean = false,
    onRetrySync: () -> Unit = {},
    onNavigateToCategories: () -> Unit,
    onShowMessage: (String) -> Unit,
    onRequestNotificationPermission: () -> Unit,
    onRequestSignIn: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isWide = isWideScreen()
    val themeMode by preferenceManager.themeModeFlow.collectAsStateWithLifecycle(initialValue = ThemeMode.SYSTEM)
    val currency by preferenceManager.currencyFlow.collectAsStateWithLifecycle(initialValue = "EUR")
    val language by preferenceManager.languageFlow.collectAsStateWithLifecycle(initialValue = "en")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsStateWithLifecycle(initialValue = true)
    val reminderHour by preferenceManager.reminderHourFlow.collectAsStateWithLifecycle(initialValue = 19)
    val reminderMinute by preferenceManager.reminderMinuteFlow.collectAsStateWithLifecycle(initialValue = 0)
    val monthlyBudget by preferenceManager.monthlyBudgetFlow.collectAsStateWithLifecycle(initialValue = null)
    val lastCloudSyncAt by preferenceManager.lastCloudSyncAtFlow.collectAsStateWithLifecycle(initialValue = null)

    // Reactive Auth State
    val currentUser by authRepository.authState.collectAsStateWithLifecycle(initialValue = authRepository.currentUser)

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberAppHaptics()

    var showThemeSheet by remember { mutableStateOf(false) }
    var showLanguageSheet by remember { mutableStateOf(false) }
    var showCurrencySheet by remember { mutableStateOf(false) }
    var showBudgetDialog by remember { mutableStateOf(false) }
    var showReminderTimeDialog by remember { mutableStateOf(false) }
    var showSignOutConfirm by remember { mutableStateOf(false) }

    val reminderTimeLabel = remember(reminderHour, reminderMinute) {
        "%02d:%02d".format(reminderHour, reminderMinute)
    }

    @Composable
    fun AppearanceSection() {
        Column {
            GroupedSectionLabel(text = stringResource(R.string.settings_section_appearance))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
            ) {
                Column {
                    SettingsActionRow(
                        icon = Icons.Rounded.Category,
                        tint = MaterialTheme.colorScheme.primary,
                        title = stringResource(R.string.settings_categories).lowercase(),
                        onClick = onNavigateToCategories
                    )
                    IosSeparator(insetStart = 56.dp)
                    SettingsActionRow(
                        icon = Icons.Rounded.Palette,
                        tint = settingsIconTintAccent(),
                        title = stringResource(R.string.settings_theme).lowercase(),
                        subtitle = themeMode.label.lowercase(),
                        onClick = { showThemeSheet = true }
                    )
                    IosSeparator(insetStart = 56.dp)
                    SettingsActionRow(
                        icon = Icons.Rounded.Language,
                        tint = settingsIconTintAccent(),
                        title = stringResource(R.string.settings_language).lowercase(),
                        subtitle = if (language == "de") stringResource(R.string.lang_german).lowercase() else stringResource(R.string.lang_english).lowercase(),
                        onClick = { showLanguageSheet = true }
                    )
                    IosSeparator(insetStart = 56.dp)
                    SettingsActionRow(
                        icon = Icons.Rounded.Payments,
                        tint = settingsIconTintAccent(),
                        title = stringResource(R.string.settings_currency).lowercase(),
                        subtitle = CurrencyUtils.labelFor(currency).lowercase(),
                        onClick = { showCurrencySheet = true }
                    )
                }
            }
        }
    }

    @Composable
    fun NotificationSection() {
        Column {
            GroupedSectionLabel(text = stringResource(R.string.settings_section_notifications))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
            ) {
                Column {
                    SettingsSwitchRow(
                        icon = Icons.Rounded.NotificationsActive,
                        tint = settingsIconTintAccent(),
                        title = stringResource(R.string.settings_evening_reminder).lowercase(),
                        checked = dailyReminder,
                        onCheckedChange = { 
                            if (it) onRequestNotificationPermission()
                            scope.launch { preferenceManager.updateDailyReminder(it) } 
                        }
                    )
                    if (dailyReminder) {
                        IosSeparator(insetStart = 56.dp)
                        SettingsActionRow(
                            icon = Icons.Rounded.Schedule,
                            tint = MaterialTheme.colorScheme.primary,
                            title = stringResource(R.string.settings_reminder_time).lowercase(),
                            subtitle = reminderTimeLabel,
                            onClick = { showReminderTimeDialog = true },
                        )
                    }
                }
            }
        }
    }

    @Composable
    fun ManagementSection() {
        Column {
            GroupedSectionLabel(text = stringResource(R.string.settings_section_management))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
            ) {
                Column {
                    if (currentUser != null) {
                        val email = currentUser?.email
                        val accountTitle = currentUser?.displayName?.takeIf { it.isNotBlank() }
                            ?: email?.substringBefore('@')?.replaceFirstChar { it.titlecase() }
                            ?: stringResource(R.string.settings_account_cloud)
                        val accountSubtitle = when {
                            syncing -> stringResource(R.string.settings_sync_in_progress)
                            lastCloudSyncAt != null -> stringResource(
                                R.string.settings_last_synced,
                                formatRelativeTimestamp(context, lastCloudSyncAt!!),
                            )
                            else -> stringResource(R.string.settings_never_synced)
                        }
                        SettingsInfoRow(
                            icon = Icons.Rounded.CloudDone,
                            tint = MaterialTheme.colorScheme.primary,
                            title = accountTitle,
                            subtitle = buildString {
                                if (!email.isNullOrBlank() && accountTitle != email) {
                                    append(email)
                                    append('\n')
                                }
                                append(accountSubtitle)
                            },
                        )
                        IosSeparator(insetStart = 56.dp)
                        SettingsActionRow(
                            icon = Icons.Rounded.Sync,
                            tint = MaterialTheme.colorScheme.primary,
                            title = stringResource(R.string.settings_sync_now).lowercase(),
                            subtitle = stringResource(R.string.settings_account_cloud_subtitle).lowercase(),
                            onClick = {
                                if (syncing) return@SettingsActionRow
                                onRetrySync()
                            },
                        )
                        IosSeparator(insetStart = 56.dp)
                    } else {
                        SettingsActionRow(
                            icon = Icons.Rounded.CloudUpload,
                            tint = MaterialTheme.colorScheme.primary,
                            title = stringResource(R.string.settings_sign_in).lowercase(),
                            subtitle = stringResource(R.string.settings_sign_in_subtitle).lowercase(),
                            onClick = onRequestSignIn,
                        )
                        IosSeparator(insetStart = 56.dp)
                    }
                    val deduplicateDoneMsg = stringResource(R.string.settings_deduplicate_done)
                    SettingsActionRow(
                        icon = Icons.Rounded.CleaningServices,
                        tint = MaterialTheme.colorScheme.primary,
                        title = stringResource(R.string.settings_deduplicate_label),
                        subtitle = stringResource(R.string.settings_deduplicate_subtitle),
                        onClick = {
                            scope.launch {
                                repository.deduplicateCategories()
                                onShowMessage(deduplicateDoneMsg)
                            }
                        }
                    )
                    IosSeparator(insetStart = 56.dp)
                    SettingsActionRow(
                        icon = Icons.Rounded.FileDownload,
                        tint = settingsIconTintMuted(),
                        title = stringResource(R.string.settings_export_csv).lowercase(),
                        subtitle = stringResource(R.string.settings_export_subtitle).lowercase(),
                        onClick = {
                            scope.launch {
                                val ok = ExportUtils.exportCsv(context, repository)
                                if (ok) haptics.success() else haptics.light()
                                onShowMessage(
                                    context.getString(
                                        if (ok) R.string.settings_export_ok else R.string.settings_export_failed,
                                    ),
                                )
                            }
                        },
                    )
                }
            }
        }
    }

    @Composable
    fun BudgetSection() {
        Column {
            GroupedSectionLabel(text = stringResource(R.string.settings_section_budget))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
            ) {
                SettingsActionRow(
                    icon = Icons.Rounded.Speed,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.settings_monthly_limit).lowercase(),
                    subtitle = monthlyBudget?.let {
                        CurrencyUtils.formatAmount(it, currency, showSymbol = true)
                    } ?: stringResource(R.string.settings_monthly_limit_not_set).lowercase(),
                    onClick = { showBudgetDialog = true },
                )
            }
        }
    }

    @Composable
    fun AboutSection() {
        Column {
            GroupedSectionLabel(text = stringResource(R.string.settings_section_about))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
            ) {
                Column {
                    SettingsActionRow(
                        icon = Icons.AutoMirrored.Rounded.Help,
                        tint = settingsIconTintMuted(),
                        title = stringResource(R.string.settings_support).lowercase(),
                        onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:support@ausgegeben.app")
                                putExtra(Intent.EXTRA_SUBJECT, "Ausgegeben Support")
                            }
                            try {
                                context.startActivity(intent)
                            } catch (_: Exception) {
                                onShowMessage(context.getString(R.string.settings_no_email_app))
                            }
                        }
                    )
                    IosSeparator(insetStart = 56.dp)
                    SettingsInfoRow(
                        icon = Icons.Rounded.Info,
                        tint = settingsIconTintMuted(),
                        title = stringResource(R.string.app_name),
                        subtitle = stringResource(R.string.settings_version_subtitle, "1.0.0"),
                    )
                }
            }
        }
    }

    Box(modifier = modifier.fillMaxSize().background(AppAurora.background())) {
        Box(modifier = Modifier.fillMaxSize().background(AppAurora.brush(center = Offset(1000f, 0f))))

        // Law: Centered Monolith constraint for large displays
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = if (isWide) 32.dp else 0.dp),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxHeight()
                    .widthIn(max = 800.dp),
                contentPadding = tabScreenListBottomPadding()
            ) {
                item { ScreenTitle(title = stringResource(R.string.screen_settings)) }

                if (syncError != null) {
                    item {
                        SyncErrorBanner(
                            error = syncError,
                            onRetry = onRetrySync,
                            modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
                        )
                    }
                }

                if (isWide) {
                    item {
                        @OptIn(ExperimentalLayoutApi::class)
                        FlowRow(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            maxItemsInEachRow = 2
                        ) {
                            Box(modifier = Modifier.weight(1f)) {
                                StaggeredEntrance(index = 0) { AppearanceSection() }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                StaggeredEntrance(index = 1) { NotificationSection() }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                StaggeredEntrance(index = 2) { BudgetSection() }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                StaggeredEntrance(index = 3) { ManagementSection() }
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                StaggeredEntrance(index = 4) { AboutSection() }
                            }
                        }
                    }
                } else {
                    item { StaggeredEntrance(index = 0) { AppearanceSection() } }
                    item { StaggeredEntrance(index = 1) { NotificationSection() } }
                    item { StaggeredEntrance(index = 2) { BudgetSection() } }
                    item { StaggeredEntrance(index = 3) { ManagementSection() } }
                    item { StaggeredEntrance(index = 4) { AboutSection() } }
                }

                if (currentUser != null) {
                    item { Spacer(Modifier.height(32.dp)) }
                    item {
                        StaggeredEntrance(index = 5) {
                            val signOutColor = settingsDestructiveColor()
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = AppSpacing.md)
                                    .appGlassCard(RoundedCornerShape(AppRadius.card))
                                    .padding(12.dp),
                            ) {
                                AppOutlinedButton(
                                    onClick = {
                                        haptics.light()
                                        showSignOutConfirm = true
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    contentColor = signOutColor,
                                    borderColor = signOutColor.copy(alpha = 0.35f),
                                ) {
                                    Text(
                                        text = stringResource(R.string.settings_sign_out).lowercase(),
                                        style = TextStyle(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            letterSpacing = 0.5.sp,
                                        ),
                                    )
                                }
                            }
                        }
                    }
                }
                
                item { Spacer(Modifier.height(56.dp)) }
            }
        }
    }

    if (showThemeSheet) {
        ThemeSelectionSheet(
            currentMode = themeMode,
            onSelect = { mode ->
                scope.launch { preferenceManager.updateThemeMode(mode) }
                showThemeSheet = false
            },
            onDismiss = { showThemeSheet = false }
        )
    }

    if (showLanguageSheet) {
        LanguageSelectionSheet(
            currentLanguage = language,
            onSelect = { lang ->
                scope.launch { 
                    preferenceManager.updateLanguage(lang)
                    val appLocale: LocaleListCompat = LocaleListCompat.forLanguageTags(lang)
                    AppCompatDelegate.setApplicationLocales(appLocale)
                }
                showLanguageSheet = false
            },
            onDismiss = { showLanguageSheet = false }
        )
    }

    if (showCurrencySheet) {
        CurrencySelectionSheet(
            currentCurrency = currency,
            onSelect = { cur ->
                scope.launch { preferenceManager.updateCurrency(cur) }
                showCurrencySheet = false
            },
            onDismiss = { showCurrencySheet = false }
        )
    }

    if (showReminderTimeDialog) {
        ReminderTimeDialog(
            initialHour = reminderHour,
            initialMinute = reminderMinute,
            onDismiss = { showReminderTimeDialog = false },
            onConfirm = { hour, minute ->
                scope.launch {
                    preferenceManager.updateReminderTime(hour, minute)
                    if (dailyReminder) {
                        ReminderScheduler.scheduleNext(context)
                    }
                    onShowMessage(
                        context.getString(R.string.settings_reminder_set, "%02d:%02d".format(hour, minute)),
                    )
                }
                showReminderTimeDialog = false
            },
        )
    }

    if (showBudgetDialog) {
        MonthlyBudgetSheet(
            currencyCode = currency,
            currentBudget = monthlyBudget,
            onDismiss = { showBudgetDialog = false },
            onSave = { amount ->
                scope.launch {
                    preferenceManager.updateMonthlyBudget(amount)
                    onShowMessage(
                        context.getString(
                            if (amount != null) R.string.settings_budget_set
                            else R.string.settings_budget_cleared,
                        ),
                    )
                }
                showBudgetDialog = false
            },
        )
    }

    if (showSignOutConfirm) {
        AppDestructiveConfirmDialog(
            onDismissRequest = { showSignOutConfirm = false },
            confirmLabel = stringResource(R.string.settings_sign_out),
            onConfirm = {
                showSignOutConfirm = false
                authViewModel.signOut { }
            },
            title = {
                Text(
                    text = stringResource(R.string.settings_sign_out).lowercase(),
                    style = MaterialTheme.typography.titleMedium,
                )
            },
            text = {
                AppDialogBodyText(stringResource(R.string.settings_sign_out_confirm))
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemeSelectionSheet(
    currentMode: ThemeMode,
    onSelect: (ThemeMode) -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_theme),
            options = ThemeMode.entries,
            isSelected = { it == currentMode },
            label = { it.label.lowercase() },
            icon = { mode ->
                val colors = mode.getPreviewColors()
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.sweepGradient(
                                0.0f to colors[0],
                                0.5f to colors[1],
                                1.0f to colors[0]
                            )
                        )
                )
            },
            onSelect = onSelect,
            onDismiss = onDismiss
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageSelectionSheet(
    currentLanguage: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val options = listOf("en" to stringResource(R.string.lang_english), "de" to stringResource(R.string.lang_german))
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_language),
            options = options,
            isSelected = { it.first == currentLanguage },
            label = { it.second.lowercase() },
            onSelect = { onSelect(it.first) },
            onDismiss = onDismiss
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CurrencySelectionSheet(
    currentCurrency: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val currencies = CurrencyUtils.supportedCurrencies
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_currency),
            options = currencies,
            isSelected = { it == currentCurrency },
            label = { it },
            secondaryLabel = { CurrencyUtils.labelFor(it).lowercase() },
            onSelect = onSelect,
            onDismiss = onDismiss
        )
    }
}

@Composable
private fun <T> SelectionSheetContent(
    title: String,
    options: List<T>,
    isSelected: (T) -> Boolean,
    label: @Composable (T) -> String,
    secondaryLabel: @Composable ((T) -> String)? = null,
    icon: @Composable ((T) -> Unit)? = null,
    onSelect: (T) -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .padding(bottom = 32.dp)
    ) {
        SheetHeader(title = title)
        
        Spacer(modifier = Modifier.height(16.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .selectableGroup(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            options.forEach { option ->
                SelectionOptionRow(
                    text = label(option),
                    secondaryText = secondaryLabel?.invoke(option),
                    selected = isSelected(option),
                    icon = icon?.let { { it(option) } },
                    onClick = { onSelect(option) }
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        SheetDismissButton(onClick = onDismiss)
    }
}


@Composable
private fun SelectionOptionRow(
    text: String,
    selected: Boolean,
    secondaryText: String? = null,
    icon: @Composable (() -> Unit)? = null,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadius.interactive))
            .semantics(mergeDescendants = true) {
                role = Role.RadioButton
                this.selected = selected
            }
            .smoothClickable { onClick() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (icon != null) {
            icon()
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
            )
            if (secondaryText != null) {
                Text(
                    text = secondaryText,
                    style = MaterialTheme.typography.bodySmall,
                    color = readableSecondaryColor()
                )
            }
        }
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun SettingsInfoRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .appGlassCard(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            SignatureText(
                text = title,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                accentColor = tint,
                textColor = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = readableSecondaryColor(),
            )
        }
    }
}

@Composable
fun SettingsActionRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String? = null,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .smoothClickable { onClick() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .appGlassCard(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = readableSecondaryColor(),
                )
            }
        }
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = navigationInactiveColor(),
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
fun SettingsSwitchRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .appGlassCard(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp)
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = MaterialTheme.colorScheme.primary,
                uncheckedThumbColor = readableSecondaryColor(),
                uncheckedTrackColor = appGlassBase()
            )
        )
    }
}

@Composable
fun ReminderTimeDialog(
    initialHour: Int,
    initialMinute: Int,
    onDismiss: () -> Unit,
    onConfirm: (Int, Int) -> Unit
) {
    var hour by remember { mutableIntStateOf(initialHour) }
    var minute by remember { mutableIntStateOf(initialMinute) }

    AppAlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_reminder_time).lowercase()) },
        confirmButton = {
            AppButton(onClick = { onConfirm(hour, minute) }) {
                Text(stringResource(R.string.action_save).lowercase())
            }
        },
        dismissButton = {
            AppTextButton(onClick = onDismiss, text = stringResource(R.string.action_cancel).lowercase())
        }
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            NumberPicker(
                value = hour,
                range = 0..23,
                onValueChange = { hour = it },
                label = "hr"
            )
            Text(":", style = MaterialTheme.typography.headlineMedium)
            NumberPicker(
                value = minute,
                range = 0..59,
                onValueChange = { minute = it },
                label = "min"
            )
        }
    }
}

@Composable
private fun NumberPicker(
    value: Int,
    range: IntRange,
    onValueChange: (Int) -> Unit,
    label: String
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = { if (value < range.last) onValueChange(value + 1) }) {
            Icon(Icons.Rounded.Add, null)
        }
        Text(
            text = "%02d".format(value),
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold)
        )
        Text(label, style = MaterialTheme.typography.labelSmall, color = readableSecondaryColor())
        IconButton(onClick = { if (value > range.first) onValueChange(value - 1) }) {
            Icon(Icons.Rounded.Remove, null)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthlyBudgetSheet(
    currencyCode: String,
    currentBudget: Double?,
    onDismiss: () -> Unit,
    onSave: (Double?) -> Unit
) {
    // Prefill with the currency's decimal separator (e.g. "900,00" for EUR). The old
    // "%.2f".format(...) used the device locale, so on German devices the comma-formatted
    // prefill failed the digit/dot input filter and toDoubleOrNull(), silently clearing
    // the budget when Save was tapped without edits.
    var amountText by remember {
        mutableStateOf(currentBudget?.let { CurrencyUtils.formatAmountForInput(it, currencyCode) } ?: "")
    }

    // Save only commits a valid positive amount; invalid or empty text can't silently
    // wipe the budget (use Clear for that). Parse mirrors the currency's separators.
    val parsedBudget = CurrencyUtils.parseAmount(amountText, currencyCode)
    val canSave = parsedBudget != null && parsedBudget > 0.0

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        Column(modifier = Modifier.padding(16.dp).navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SheetHeader(
                    title = stringResource(R.string.settings_budget_dialog_title),
                    subtitle = stringResource(R.string.settings_budget_dialog_body),
                    modifier = Modifier.weight(1f)
                )
                SheetDismissButton(onClick = onDismiss)
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            OutlinedTextField(
                value = amountText,
                onValueChange = { input ->
                    // Digits plus at most one decimal separator — blocks "9,9,9" that
                    // would parse to null and clear the budget.
                    val separators = input.count { it == '.' || it == ',' }
                    if (input.all { c -> c.isDigit() || c == '.' || c == ',' } && separators <= 1) {
                        amountText = input
                    }
                },
                label = { Text(stringResource(R.string.settings_budget_amount_label, currencyCode).lowercase()) },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                colors = appTextFieldColors()
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppOutlinedButton(
                    onClick = { onSave(null) },
                    modifier = Modifier.weight(1f),
                    contentColor = MaterialTheme.colorScheme.error
                ) {
                    Text(stringResource(R.string.action_clear).lowercase())
                }
                AppButton(
                    onClick = { parsedBudget?.let(onSave) },
                    enabled = canSave,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(R.string.action_save).lowercase())
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
