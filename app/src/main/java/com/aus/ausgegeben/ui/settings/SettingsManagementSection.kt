package com.aus.ausgegeben.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.SettingsActionRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*

@Composable
fun SettingsManagementSection(
    onNavigateToCategories: () -> Unit,
    onOpenRecurring: () -> Unit = {},
    onExportCsv: () -> Unit,
    onExportBackup: () -> Unit,
    onRestoreBackup: () -> Unit,
    onReplaceBackup: () -> Unit,
) {
    Column {
        GroupedSectionLabel(text = stringResource(R.string.settings_section_management))
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
                    title = stringResource(R.string.settings_categories),
                    subtitle = stringResource(R.string.settings_categories_subtitle),
                    onClick = onNavigateToCategories,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Repeat,
                    tint = MaterialTheme.colorScheme.primary,
                    title = stringResource(R.string.recurring_title),
                    subtitle = stringResource(R.string.recurring_contract),
                    onClick = onOpenRecurring,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.FileDownload,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.settings_export_csv),
                    subtitle = stringResource(R.string.settings_export_subtitle),
                    onClick = onExportCsv,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Backup,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.settings_export_backup),
                    subtitle = stringResource(R.string.settings_export_backup_subtitle),
                    onClick = onExportBackup,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Restore,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.settings_restore_backup),
                    subtitle = stringResource(R.string.settings_restore_backup_subtitle),
                    onClick = onRestoreBackup,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.SwapHoriz,
                    tint = settingsDestructiveColor(),
                    title = stringResource(R.string.settings_replace_backup),
                    subtitle = stringResource(R.string.settings_replace_backup_subtitle),
                    onClick = onReplaceBackup,
                )
            }
        }
    }
}
