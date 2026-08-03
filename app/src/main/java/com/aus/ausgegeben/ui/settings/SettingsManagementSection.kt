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
    onExportCsv: () -> Unit,
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
                    title = stringResource(R.string.settings_categories).lowercase(),
                    subtitle = stringResource(R.string.settings_categories_subtitle).lowercase(),
                    onClick = onNavigateToCategories,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.FileDownload,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.settings_export_csv).lowercase(),
                    subtitle = stringResource(R.string.settings_export_subtitle).lowercase(),
                    onClick = onExportCsv,
                )
            }
        }
    }
}
