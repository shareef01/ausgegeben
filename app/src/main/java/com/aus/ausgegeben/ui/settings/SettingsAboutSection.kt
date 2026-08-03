package com.aus.ausgegeben.ui.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Help
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.BuildConfig
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.SettingsActionRow
import com.aus.ausgegeben.ui.SettingsInfoRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*

@Composable
fun SettingsAboutSection(
    onSupportUnavailable: () -> Unit,
) {
    val context = LocalContext.current
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
                            onSupportUnavailable()
                        }
                    },
                )
                IosSeparator(insetStart = 56.dp)
                SettingsInfoRow(
                    icon = Icons.Rounded.Info,
                    tint = settingsIconTintMuted(),
                    title = stringResource(R.string.app_name),
                    subtitle = stringResource(
                        R.string.settings_version_subtitle,
                        BuildConfig.VERSION_NAME,
                    ),
                )
            }
        }
    }
}
