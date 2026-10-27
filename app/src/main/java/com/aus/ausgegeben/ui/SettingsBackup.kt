package com.aus.ausgegeben.ui

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.auth.AuthUser
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.AppHaptics
import com.aus.ausgegeben.util.BackupFormat
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.ExportUtils
import com.aus.ausgegeben.util.ReplacePlanner
import com.aus.ausgegeben.util.RestoreUtils
import com.aus.ausgegeben.util.rememberAppHaptics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Backup export, restore (merge) and Replace on the Settings screen. Moved out of
 * SettingsScreen.kt: the state that was local `remember` vars is now this holder's
 * properties (same names, same `mutableStateOf` values), and the moved handlers, banner
 * and dialogs run inside `with(state)`, so their bodies are unchanged. SettingsScreen
 * places the banner item and the dialogs where they were.
 */
internal class SettingsBackupState {
    lateinit var repository: AppRepository
    lateinit var preferenceManager: PreferenceManager
    lateinit var context: Context
    lateinit var scope: CoroutineScope
    lateinit var haptics: AppHaptics
    lateinit var currentUserState: State<AuthUser?>
    val currentUser: AuthUser? get() = currentUserState.value
    var onShowMessage: (String) -> Unit = {}
    var onRequestSignIn: () -> Unit = {}
    var exportBackup: () -> Unit = {}
    var onRestoreBackup: () -> Unit = {}
    var onReplaceBackup: () -> Unit = {}

    var showRestoreConfirm by mutableStateOf(false)
    var pendingRestore by mutableStateOf<Pair<BackupFormat.ParsedBackup, BackupFormat.BackupSummary>?>(null)
    var pendingRestoreUid by mutableStateOf<String?>(null)
    var isRestoring by mutableStateOf(false)
    var showReplaceConfirm by mutableStateOf(false)
    var pendingReplace by mutableStateOf<Triple<BackupFormat.ParsedBackup, BackupFormat.BackupSummary, ReplacePlanner.ReplacePlan>?>(null)
    var pendingReplaceUid by mutableStateOf<String?>(null)
    var isReplacing by mutableStateOf(false)
    var unresolvedOp by mutableStateOf<ReplacePlanner.RestoreOperationDoc?>(null)
    var isResumeMode by mutableStateOf(false)
}

@Composable
internal fun rememberSettingsBackupState(
    repository: AppRepository,
    preferenceManager: PreferenceManager,
    currentUserState: State<AuthUser?>,
    onShowMessage: (String) -> Unit,
    onRequestSignIn: () -> Unit,
): SettingsBackupState {
    val state = remember { SettingsBackupState() }
    state.repository = repository
    state.preferenceManager = preferenceManager
    state.context = LocalContext.current
    state.scope = rememberCoroutineScope()
    state.haptics = rememberAppHaptics()
    state.currentUserState = currentUserState
    state.onShowMessage = onShowMessage
    state.onRequestSignIn = onRequestSignIn
    with(state) {
        LaunchedEffect(currentUser?.uid) {
            unresolvedOp = repository.getRestoreOperation(currentUser?.uid)
        }

        fun exportBackup() {
            scope.launch {
                val result = ExportUtils.exportBackupJson(context, repository, preferenceManager)
                if (result.success) haptics.success() else haptics.light()
                onShowMessage(
                    context.getString(
                        if (result.success) R.string.settings_export_backup_ok else R.string.settings_export_failed,
                    ),
                )
            }
        }

        val restoreLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.OpenDocument()
        ) { uri: android.net.Uri? ->
            if (uri == null) return@rememberLauncherForActivityResult
            val uid = currentUser?.uid
            if (uid == null) {
                onShowMessage(context.getString(R.string.settings_sign_in))
                return@rememberLauncherForActivityResult
            }
            scope.launch {
                val result = RestoreUtils.readAndValidateBackupUri(context.contentResolver, uri)
                when (result) {
                    is RestoreUtils.ReadResult.Success -> {
                        pendingRestore = result.backup to result.summary
                        pendingRestoreUid = uid
                        showRestoreConfirm = true
                    }
                    is RestoreUtils.ReadResult.FileTooLarge -> {
                        haptics.light()
                        onShowMessage(context.getString(R.string.settings_restore_file_too_large))
                    }
                    is RestoreUtils.ReadResult.InvalidJson,
                    is RestoreUtils.ReadResult.ValidationError,
                    is RestoreUtils.ReadResult.IoError -> {
                        haptics.light()
                        onShowMessage(context.getString(R.string.settings_restore_invalid))
                    }
                }
            }
        }

        fun onRestoreBackup() {
            if (currentUser == null) {
                onShowMessage(context.getString(R.string.settings_sign_in))
                onRequestSignIn()
                return
            }
            restoreLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream", "*/*"))
        }

        val replaceLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.OpenDocument()
        ) { uri: android.net.Uri? ->
            if (uri == null) {
                isResumeMode = false
                return@rememberLauncherForActivityResult
            }
            val uid = currentUser?.uid
            if (uid == null) {
                isResumeMode = false
                onShowMessage(context.getString(R.string.settings_sign_in))
                return@rememberLauncherForActivityResult
            }
            scope.launch {
                val result = RestoreUtils.readAndValidateBackupUri(context.contentResolver, uri)
                when (result) {
                    is RestoreUtils.ReadResult.Success -> {
                        if (isResumeMode && unresolvedOp != null) {
                            val fp = ReplacePlanner.computeBackupFingerprint(result.backup)
                            val legacyFp = ReplacePlanner.computeLegacyBackupFingerprint(result.backup)
                            if (fp != unresolvedOp!!.backupFingerprint && legacyFp != unresolvedOp!!.backupFingerprint) {
                                isResumeMode = false
                                haptics.light()
                                onShowMessage("FINGERPRINT_MISMATCH: Selected backup does not match the unfinished operation")
                                return@launch
                            }
                            isReplacing = true
                            val res = repository.resumeReplace(unresolvedOp!!, result.backup, uid)
                            isReplacing = false
                            isResumeMode = false
                            if (res.isSuccess) {
                                haptics.success()
                                onShowMessage(context.getString(R.string.settings_replace_success))
                                unresolvedOp = repository.getRestoreOperation(uid)
                            } else {
                                haptics.light()
                                val err = res.exceptionOrNull()?.message ?: ""
                                onShowMessage(context.getString(R.string.settings_replace_failed, err))
                                unresolvedOp = repository.getRestoreOperation(uid)
                            }
                            return@launch
                        }

                        val planRes = repository.planReplace(result.backup)
                        if (planRes.isFailure) {
                            haptics.light()
                            val err = planRes.exceptionOrNull()?.message ?: ""
                            onShowMessage(context.getString(R.string.settings_replace_failed, err))
                            return@launch
                        }
                        val plan = planRes.getOrThrow()
                        if (plan.conflicts.isNotEmpty()) {
                            haptics.light()
                            onShowMessage(plan.conflicts.joinToString("; "))
                            return@launch
                        }

                        pendingReplace = Triple(result.backup, result.summary, plan)
                        pendingReplaceUid = uid
                        showReplaceConfirm = true
                    }
                    is RestoreUtils.ReadResult.FileTooLarge -> {
                        isResumeMode = false
                        haptics.light()
                        onShowMessage(context.getString(R.string.settings_restore_file_too_large))
                    }
                    is RestoreUtils.ReadResult.InvalidJson,
                    is RestoreUtils.ReadResult.ValidationError,
                    is RestoreUtils.ReadResult.IoError -> {
                        isResumeMode = false
                        haptics.light()
                        onShowMessage(context.getString(R.string.settings_restore_invalid))
                    }
                }
            }
        }

        fun onReplaceBackup() {
            if (currentUser == null) {
                onShowMessage(context.getString(R.string.settings_sign_in))
                onRequestSignIn()
                return
            }
            replaceLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream", "*/*"))
        }

        state.exportBackup = ::exportBackup
        state.onRestoreBackup = ::onRestoreBackup
        state.onReplaceBackup = ::onReplaceBackup
    }
    return state
}

/** The unfinished-Replace banner, as an item at the top of the Settings list. */
internal fun LazyListScope.unfinishedReplacementBannerItem(state: SettingsBackupState) {
    with(state) {
        if (unresolvedOp != null &&
            unresolvedOp!!.phase != ReplacePlanner.RestorePhase.COMPLETED &&
            unresolvedOp!!.phase != ReplacePlanner.RestorePhase.ROLLED_BACK
        ) {
            item {
                UnfinishedReplacementBanner(
                    op = unresolvedOp!!,
                    onResume = {
                        isResumeMode = true
                        onReplaceBackup()
                    },
                    onRollback = {
                        scope.launch {
                            isReplacing = true
                            val uid = currentUser?.uid ?: return@launch
                            val res = repository.rollbackReplace(unresolvedOp!!, uid)
                            isReplacing = false
                            if (res.isSuccess) {
                                haptics.success()
                                onShowMessage(context.getString(R.string.settings_replace_rollback_success))
                                unresolvedOp = repository.getRestoreOperation(uid)
                            } else {
                                haptics.light()
                                val err = res.exceptionOrNull()?.message ?: ""
                                onShowMessage(context.getString(R.string.settings_replace_rollback_failed, err))
                                unresolvedOp = repository.getRestoreOperation(uid)
                            }
                        }
                    },
                    onDismiss = {
                        scope.launch {
                            val uid = currentUser?.uid ?: return@launch
                            repository.dismissCompletedOperation(uid)
                            unresolvedOp = null
                        }
                    },
                    busy = isReplacing,
                    modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
                )
            }
        }
    }
}

/** The restore and Replace confirmation dialogs. */
@Composable
internal fun SettingsBackupDialogs(state: SettingsBackupState) {
    with(state) {
        if (showRestoreConfirm && pendingRestore != null) {
            val (backup, summary) = pendingRestore!!
            AppAlertDialog(
                onDismissRequest = {
                    if (!isRestoring) {
                        showRestoreConfirm = false
                        pendingRestore = null
                        pendingRestoreUid = null
                    }
                },
                title = {
                    Text(
                        text = stringResource(R.string.settings_restore_backup_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AppDialogBodyText(stringResource(R.string.settings_restore_backup_explain))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            stringResource(
                                R.string.settings_restore_backup_summary,
                                summary.expenseCount,
                                summary.categoryCount,
                                summary.currency
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        if (summary.schemaVersion == 1) Text(stringResource(R.string.category_budget_v1))
                        if (summary.monthlyBudget != null) {
                            Text(
                                stringResource(
                                    R.string.settings_restore_backup_budget,
                                    CurrencyUtils.formatAmount(summary.monthlyBudget, summary.currency)
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = readableSecondaryColor(),
                            )
                        }
                    }
                },
                confirmButton = {
                    AppButton(
                        enabled = !isRestoring,
                        onClick = {
                            val targetUid = pendingRestoreUid
                            if (targetUid == null || currentUser?.uid != targetUid) {
                                showRestoreConfirm = false
                                pendingRestore = null
                                pendingRestoreUid = null
                                haptics.light()
                                onShowMessage(context.getString(R.string.settings_restore_auth_changed))
                                return@AppButton
                            }
                            isRestoring = true
                            scope.launch {
                                try {
                                    val result = repository.restoreBackup(backup, targetUid)
                                    isRestoring = false
                                    showRestoreConfirm = false
                                    pendingRestore = null
                                    pendingRestoreUid = null
                                    result.onSuccess { restored ->
                                        haptics.success()
                                        onShowMessage(
                                            context.getString(
                                                R.string.settings_restore_success,
                                                restored.expensesRestored,
                                                restored.categoriesRestored,
                                            )
                                        )
                                    }.onFailure { ex ->
                                        haptics.light()
                                        val msg = when {
                                            ex.message?.contains("CONFLICT") == true ->
                                                context.getString(R.string.settings_restore_conflict)
                                            ex.message?.startsWith("CATEGORY_BUSY") == true ->
                                                context.getString(R.string.settings_restore_category_busy)
                                            else -> context.getString(R.string.settings_restore_failed)
                                        }
                                        onShowMessage(msg)
                                    }
                                } catch (e: Exception) {
                                    isRestoring = false
                                    showRestoreConfirm = false
                                    pendingRestore = null
                                    pendingRestoreUid = null
                                    haptics.light()
                                    val msg = when {
                                        e.message?.contains("CONFLICT") == true ->
                                            context.getString(R.string.settings_restore_conflict)
                                        e.message?.startsWith("CATEGORY_BUSY") == true ->
                                            context.getString(R.string.settings_restore_category_busy)
                                        else -> context.getString(R.string.settings_restore_failed)
                                    }
                                    onShowMessage(msg)
                                }
                            }
                        },
                    ) {
                        Text(
                            stringResource(
                                if (isRestoring) R.string.state_loading
                                else R.string.settings_restore_backup_action
                            )
                        )
                    }
                },
                dismissButton = {
                    AppTextButton(
                        enabled = !isRestoring,
                        onClick = {
                            showRestoreConfirm = false
                            pendingRestore = null
                            pendingRestoreUid = null
                        },
                        text = stringResource(R.string.action_cancel),
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    )
                },
            )
        }

        if (showReplaceConfirm && pendingReplace != null) {
            val (backup, summary, plan) = pendingReplace!!
            AppAlertDialog(
                onDismissRequest = {
                    if (!isReplacing) {
                        showReplaceConfirm = false
                        pendingReplace = null
                        pendingReplaceUid = null
                    }
                },
                title = {
                    Text(
                        text = stringResource(R.string.settings_replace_backup_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AppDialogBodyText(stringResource(R.string.settings_replace_backup_explain))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            stringResource(
                                R.string.settings_replace_backup_preflight,
                                plan.counts.backupExpenseCount,
                                plan.counts.backupCategoryCount,
                                plan.counts.expensesToDeleteCount,
                                plan.counts.categoriesToUpsertCount,
                                plan.counts.categoriesPreservedCount,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                },
                confirmButton = {
                    AppButton(
                        enabled = !isReplacing,
                        onClick = {
                            val targetUid = pendingReplaceUid
                            if (targetUid == null || currentUser?.uid != targetUid) {
                                showReplaceConfirm = false
                                pendingReplace = null
                                pendingReplaceUid = null
                                haptics.light()
                                onShowMessage(context.getString(R.string.settings_restore_auth_changed))
                                return@AppButton
                            }
                            isReplacing = true
                            scope.launch {
                                try {
                                    val result = repository.executeReplace(backup, targetUid)
                                    isReplacing = false
                                    showReplaceConfirm = false
                                    pendingReplace = null
                                    pendingReplaceUid = null
                                    if (result.isSuccess) {
                                        haptics.success()
                                        onShowMessage(context.getString(R.string.settings_replace_success))
                                        unresolvedOp = repository.getRestoreOperation(targetUid)
                                    } else {
                                        haptics.light()
                                        val err = result.exceptionOrNull()?.message ?: ""
                                        onShowMessage(context.getString(R.string.settings_replace_failed, err))
                                        unresolvedOp = repository.getRestoreOperation(targetUid)
                                    }
                                } catch (e: Exception) {
                                    isReplacing = false
                                    showReplaceConfirm = false
                                    pendingReplace = null
                                    pendingReplaceUid = null
                                    haptics.light()
                                    val err = e.message ?: ""
                                    onShowMessage(context.getString(R.string.settings_replace_failed, err))
                                    unresolvedOp = repository.getRestoreOperation(targetUid)
                                }
                            }
                        },
                    ) {
                        Text(
                            stringResource(
                                if (isReplacing) R.string.state_loading
                                else R.string.settings_replace_backup_action
                            )
                        )
                    }
                },
                dismissButton = {
                    AppTextButton(
                        enabled = !isReplacing,
                        onClick = {
                            showReplaceConfirm = false
                            pendingReplace = null
                            pendingReplaceUid = null
                        },
                        text = stringResource(R.string.action_cancel),
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    )
                },
            )
        }
    }
}
