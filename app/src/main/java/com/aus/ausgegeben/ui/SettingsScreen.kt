package com.aus.ausgegeben.ui

import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.os.LocaleListCompat
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.cloud.CloudSyncCoordinator
import com.aus.ausgegeben.data.cloud.CloudSyncRepository
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    repository: AppRepository,
    preferenceManager: PreferenceManager,
    authRepository: AuthRepository,
    authViewModel: AuthViewModel,
    cloudSyncRepository: CloudSyncRepository,
    cloudSyncCoordinator: CloudSyncCoordinator,
    onNavigateToCategories: () -> Unit,
    onShowMessage: (String) -> Unit,
    onRequestNotificationPermission: () -> Unit,
    onRequestSignIn: () -> Unit,
    modifier: Modifier = Modifier
) {
    val themeMode by preferenceManager.themeModeFlow.collectAsState(initial = ThemeMode.SYSTEM)
    val currency by preferenceManager.currencyFlow.collectAsState(initial = "EUR")
    val language by preferenceManager.languageFlow.collectAsState(initial = "en")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsState(initial = true)
    
    // Reactive Auth State
    val currentUser by authRepository.authState.collectAsState(initial = authRepository.currentUser)
    
    val scope = rememberCoroutineScope()
    var showThemeSheet by remember { mutableStateOf(false) }
    var showLanguageSheet by remember { mutableStateOf(false) }
    var showCurrencySheet by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = tabScreenListBottomPadding()
    ) {
        item { ScreenTitle(title = stringResource(R.string.screen_settings)) }

        item { GroupedSectionLabel(text = stringResource(R.string.settings_section_appearance)) }
        item {
            GroupedSection {
                SettingsActionRow(
                    icon = Icons.Rounded.Category,
                    tint = MaterialTheme.colorScheme.primary,
                    title = stringResource(R.string.settings_categories).lowercase(),
                    onClick = onNavigateToCategories
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Palette,
                    tint = Color(0xFFFB7185), // Soft Coral
                    title = stringResource(R.string.settings_theme).lowercase(),
                    subtitle = themeMode.label.lowercase(),
                    onClick = { showThemeSheet = true }
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Language,
                    tint = Color(0xFF8B5CF6), // Violet
                    title = stringResource(R.string.settings_language).lowercase(),
                    subtitle = if (language == "de") stringResource(R.string.lang_german).lowercase() else stringResource(R.string.lang_english).lowercase(),
                    onClick = { showLanguageSheet = true }
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Payments,
                    tint = Color(0xFF10B981), // Emerald
                    title = stringResource(R.string.settings_currency).lowercase(),
                    subtitle = currency,
                    onClick = { showCurrencySheet = true }
                )
            }
        }

        item { GroupedSectionLabel(text = stringResource(R.string.settings_section_notifications)) }
        item {
            GroupedSection {
                SettingsSwitchRow(
                    icon = Icons.Rounded.NotificationsActive,
                    tint = Color(0xFFFBBF24), // Amber
                    title = stringResource(R.string.settings_evening_reminder).lowercase(),
                    checked = dailyReminder,
                    onCheckedChange = { 
                        if (it) onRequestNotificationPermission()
                        scope.launch { preferenceManager.updateDailyReminder(it) } 
                    }
                )
            }
        }

        item { GroupedSectionLabel(text = stringResource(R.string.settings_section_management)) }
        item {
            GroupedSection {
                SettingsActionRow(
                    icon = Icons.Rounded.CloudUpload,
                    tint = MaterialTheme.colorScheme.primary,
                    title = stringResource(R.string.settings_account_cloud).lowercase(),
                    onClick = onRequestSignIn
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.FileDownload,
                    tint = Color(0xFF94A3B8), // Slate
                    title = stringResource(R.string.settings_export_csv).lowercase(),
                    onClick = { /* Handle export click */ }
                )
            }
        }

        if (currentUser != null) {
            item { Spacer(Modifier.height(32.dp)) }
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFFFB7185).copy(alpha = 0.1f))
                        .premiumClickable {
                            authViewModel.signOut {
                                scope.launch {
                                    preferenceManager.resetAuthGateway()
                                }
                            }
                        }
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.settings_sign_out).lowercase(),
                        style = TextStyle(
                            color = Color(0xFFFB7185),
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            letterSpacing = 0.5.sp
                        )
                    )
                }
            }
        }
        
        item { Spacer(Modifier.height(40.dp)) }
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
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = Color.Black.copy(alpha = 0.45f),
        dragHandle = { BottomSheetDefaults.DragHandle(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)) },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_theme),
            items = ThemeMode.entries,
            isSelected = { it == currentMode },
            label = { it.label },
            preview = { mode ->
                val previewColors = mode.getPreviewColors()
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.sweepGradient(
                                colors = if (previewColors.size > 1) previewColors else listOf(previewColors[0], previewColors[0])
                            )
                        )
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.2f), CircleShape)
                )
            },
            onSelect = onSelect
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
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_language),
            items = listOf("en", "de"),
            isSelected = { it == currentLanguage },
            label = { if (it == "de") stringResource(R.string.lang_german) else stringResource(R.string.lang_english) },
            preview = { lang ->
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = lang.uppercase(),
                        style = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    )
                }
            },
            onSelect = onSelect
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
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        SelectionSheetContent(
            title = stringResource(R.string.settings_choose_currency),
            items = CurrencyUtils.supportedCurrencies,
            isSelected = { it == currentCurrency },
            label = { CurrencyUtils.labelFor(it) },
            preview = { cur ->
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF10B981).copy(alpha = 0.1f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = CurrencyUtils.symbolFor(cur),
                        style = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
                    )
                }
            },
            onSelect = onSelect
        )
    }
}

@Composable
private fun <T> SelectionSheetContent(
    title: String,
    items: List<T>,
    isSelected: (T) -> Boolean,
    label: @Composable (T) -> String,
    preview: @Composable (T) -> Unit,
    onSelect: (T) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(bottom = 24.dp)
    ) {
        Text(
            text = title.lowercase(),
            style = MaterialTheme.typography.labelSmall.copy(
                letterSpacing = 1.2.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            ),
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        )
        
        Spacer(Modifier.height(8.dp))

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            items(items) { item ->
                SelectionOptionRow(
                    label = label(item),
                    isSelected = isSelected(item),
                    preview = { preview(item) },
                    onClick = { onSelect(item) }
                )
            }
        }
    }
}

@Composable
private fun SelectionOptionRow(
    label: String,
    isSelected: Boolean,
    preview: @Composable () -> Unit,
    onClick: () -> Unit
) {
    val background by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f) else Color.Transparent,
        animationSpec = tween(200),
        label = "rowBg"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(background)
            .premiumClickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        preview()

        Spacer(Modifier.width(16.dp))

        Text(
            text = label.lowercase(),
            style = MaterialTheme.typography.bodyLarge.copy(
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                letterSpacing = (-0.2).sp
            ),
            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )

        if (isSelected) {
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
private fun SettingsActionRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String? = null,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .premiumClickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(tint.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
        }

        Spacer(Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title.lowercase(),
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 8.dp)
            )
        }

        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            null,
            tint = MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
private fun SettingsSwitchRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(tint.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
        }

        Spacer(Modifier.width(16.dp))

        Text(
            text = title.lowercase(),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )

        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = Color(0xFF10B981),
                uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant
            )
        )
    }
}
