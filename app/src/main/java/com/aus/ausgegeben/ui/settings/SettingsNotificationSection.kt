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
import com.aus.ausgegeben.ui.SettingsSwitchRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*

@Composable
fun SettingsNotificationSection(
    dailyReminder: Boolean,
    reminderTimeLabel: String,
    onDailyReminderChange: (Boolean) -> Unit,
    onShowReminderTimeDialog: () -> Unit,
) {
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
                    onCheckedChange = onDailyReminderChange,
                )
                if (dailyReminder) {
                    IosSeparator(insetStart = 56.dp)
                    SettingsActionRow(
                        icon = Icons.Rounded.Schedule,
                        tint = MaterialTheme.colorScheme.primary,
                        title = stringResource(R.string.settings_reminder_time).lowercase(),
                        subtitle = reminderTimeLabel,
                        onClick = onShowReminderTimeDialog,
                    )
                }
            }
        }
    }
}
