package com.aus.ausgegeben.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.sync.CloudAuthManager
import com.aus.ausgegeben.sync.SyncManager
import com.aus.ausgegeben.ui.theme.AppSpacing
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

@Composable
fun CloudSettingsSection(
    authManager: CloudAuthManager,
    syncManager: SyncManager,
    preferenceManager: PreferenceManager,
    onShowMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val user by authManager.currentUser.collectAsState()
    val isSyncing by authManager.isSyncing.collectAsState()
    val lastSyncAt by preferenceManager.lastCloudSyncAtFlow.collectAsState(initial = null)

    var showEmailDialog by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isSignUp by remember { mutableStateOf(false) }
    var authBusy by remember { mutableStateOf(false) }

    val syncSubtitle = when {
        isSyncing -> stringResource(R.string.settings_cloud_syncing)
        user == null -> stringResource(R.string.settings_cloud_signed_out_subtitle)
        lastSyncAt != null -> stringResource(
            R.string.settings_cloud_last_sync,
            DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                .format(Date(lastSyncAt!!))
        )
        else -> stringResource(R.string.settings_cloud_never_synced)
    }

    SettingSectionTitle(stringResource(R.string.settings_section_cloud))

    SettingsGroup {
        if (user != null) {
            SettingRow(
                icon = Icons.Rounded.CloudDone,
                title = user?.email ?: stringResource(R.string.settings_cloud_account),
                subtitle = syncSubtitle,
                hasChevron = false,
                onClick = null
            )
            SettingsDivider()
            SettingRow(
                icon = Icons.Rounded.Sync,
                title = stringResource(R.string.settings_cloud_sync_now),
                subtitle = stringResource(R.string.settings_cloud_sync_now_subtitle),
                onClick = {
                    scope.launch {
                        try {
                            syncManager.fullSync()
                            onShowMessage(context.getString(R.string.settings_cloud_sync_ok))
                        } catch (_: Exception) {
                            onShowMessage(context.getString(R.string.settings_cloud_sync_failed))
                        }
                    }
                }
            )
            SettingsDivider()
            SettingRow(
                icon = Icons.Rounded.Logout,
                title = stringResource(R.string.settings_cloud_sign_out),
                subtitle = stringResource(R.string.settings_cloud_sign_out_subtitle),
                onClick = {
                    scope.launch {
                        authManager.signOut()
                        onShowMessage(context.getString(R.string.settings_cloud_signed_out))
                    }
                }
            )
        } else {
            SettingRow(
                icon = Icons.Rounded.Cloud,
                title = stringResource(R.string.settings_cloud_sign_in),
                subtitle = stringResource(R.string.settings_cloud_signed_out_subtitle),
                onClick = { showEmailDialog = true }
            )
        }
    }

    if (authBusy || isSyncing) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = AppSpacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            CircularProgressIndicator()
        }
    }

    if (showEmailDialog) {
        AlertDialog(
            onDismissRequest = { if (!authBusy) showEmailDialog = false },
            title = {
                Text(
                    if (isSignUp) stringResource(R.string.settings_cloud_create_account)
                    else stringResource(R.string.settings_cloud_sign_in)
                )
            },
            text = {
                Column {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text(stringResource(R.string.settings_cloud_email)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(AppSpacing.sm))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.settings_cloud_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !authBusy && email.isNotBlank() && password.length >= 6,
                    onClick = {
                        scope.launch {
                            authBusy = true
                            try {
                                if (isSignUp) {
                                    authManager.signUpWithEmail(email, password)
                                } else {
                                    authManager.signInWithEmail(email, password)
                                }
                                showEmailDialog = false
                                onShowMessage(context.getString(R.string.settings_cloud_signed_in))
                            } catch (_: Exception) {
                                onShowMessage(context.getString(R.string.settings_cloud_auth_failed))
                            } finally {
                                authBusy = false
                            }
                        }
                    }
                ) {
                    Text(
                        if (isSignUp) stringResource(R.string.settings_cloud_create_account)
                        else stringResource(R.string.settings_cloud_sign_in)
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { isSignUp = !isSignUp }) {
                    Text(
                        if (isSignUp) stringResource(R.string.settings_cloud_have_account)
                        else stringResource(R.string.settings_cloud_need_account)
                    )
                }
            }
        )
    }
}
