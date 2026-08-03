package com.aus.ausgegeben.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.auth.AuthUser
import com.aus.ausgegeben.ui.SettingsActionRow
import com.aus.ausgegeben.ui.SettingsInfoRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.formatRelativeTimestamp

@Composable
fun SettingsAccountSection(
    currentUser: AuthUser?,
    syncing: Boolean,
    lastCloudSyncAt: Long?,
    onRetrySync: () -> Unit,
    onRequestSignIn: () -> Unit,
) {
    val context = LocalContext.current
    Column {
        GroupedSectionLabel(text = stringResource(R.string.settings_section_account))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppSpacing.md)
                .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
        ) {
            Column {
                if (currentUser != null) {
                    val email = currentUser.email
                    val accountTitle = stringResource(
                        R.string.settings_account_signed_in_as,
                        currentUser.displayName?.takeIf { it.isNotBlank() }
                            ?: email?.substringBefore('@')?.replaceFirstChar { it.titlecase() }
                            ?: stringResource(R.string.settings_account_cloud),
                    )
                    val accountSubtitle = when {
                        syncing -> stringResource(R.string.settings_sync_in_progress)
                        lastCloudSyncAt != null -> stringResource(
                            R.string.settings_last_synced,
                            formatRelativeTimestamp(context, lastCloudSyncAt),
                        )
                        else -> stringResource(R.string.settings_account_sync_enabled)
                    }
                    SettingsInfoRow(
                        icon = Icons.Rounded.CloudDone,
                        tint = MaterialTheme.colorScheme.primary,
                        title = accountTitle,
                        subtitle = buildString {
                            if (!email.isNullOrBlank()) {
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
                } else {
                    SettingsActionRow(
                        icon = Icons.Rounded.CloudUpload,
                        tint = MaterialTheme.colorScheme.primary,
                        title = stringResource(R.string.settings_sign_in).lowercase(),
                        subtitle = stringResource(R.string.settings_account_offline_subtitle).lowercase(),
                        onClick = onRequestSignIn,
                    )
                }
            }
        }
    }
}
