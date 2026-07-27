package com.aus.ausgegeben

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.hilt.navigation.compose.hiltViewModel
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.*
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.notification.*
import com.aus.ausgegeben.ui.*
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.ConnectivityObserver
import com.google.accompanist.permissions.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.withContext
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var preferenceManager: PreferenceManager
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var preferencesCloudSync: PreferencesCloudSync
    @Inject lateinit var repository: AppRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val syncScope = rememberCoroutineScope()
            val currentUser by authRepository.authState.collectAsStateWithLifecycle(initialValue = authRepository.currentUser)

            LaunchedEffect(currentUser?.uid) {
                val uid = currentUser?.uid
                if (uid == null) {
                    preferencesCloudSync.stop()
                } else {
                    preferencesCloudSync.start(uid, syncScope)
                }
            }
            DisposableEffect(preferencesCloudSync) {
                onDispose { preferencesCloudSync.stop() }
            }

            val themeMode by preferenceManager.themeModeFlow.collectAsStateWithLifecycle(initialValue = ThemeMode.SYSTEM)

            AusgegebenTheme(themeMode = themeMode) {
                MainApp(
                    repository = repository,
                    preferenceManager = preferenceManager,
                    authRepository = authRepository,
                    preferencesCloudSync = preferencesCloudSync,
                    openAddFromNotification = intent?.getBooleanExtra(
                        NotificationHelper.EXTRA_OPEN_ADD,
                        false
                    ) == true
                )
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MainApp(
    repository: AppRepository,
    preferenceManager: PreferenceManager,
    authRepository: AuthRepository,
    preferencesCloudSync: PreferencesCloudSync,
    openAddFromNotification: Boolean = false
) {
    val context = LocalContext.current
    val activity = LocalActivity.current as? AppCompatActivity ?: return
    val currentUser by authRepository.authState.collectAsStateWithLifecycle(initialValue = authRepository.currentUser)
    val currency by preferenceManager.currencyFlow.collectAsStateWithLifecycle(initialValue = "EUR")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsStateWithLifecycle(initialValue = true)
    val reminderHour by preferenceManager.reminderHourFlow.collectAsStateWithLifecycle(initialValue = 19)
    val reminderMinute by preferenceManager.reminderMinuteFlow.collectAsStateWithLifecycle(initialValue = 0)
    val onboardingComplete by preferenceManager.onboardingCompleteFlow.collectAsStateWithLifecycle(initialValue = false)
    val isOnline by ConnectivityObserver.observe(context).collectAsStateWithLifecycle(initialValue = true)
    val prefsSyncError by preferencesCloudSync.syncError.collectAsStateWithLifecycle(initialValue = null)
    val preferencesReady by preferencesCloudSync.preferencesReady.collectAsStateWithLifecycle(initialValue = false)
    val listenerError by repository.listenerError.collectAsStateWithLifecycle(initialValue = null)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var pendingOpenAdd by remember { mutableStateOf(openAddFromNotification) }
    var showAuthFromSettings by remember { mutableStateOf(false) }
    var verifyDismissed by remember { mutableStateOf(false) }
    var verifyBusy by remember { mutableStateOf(false) }
    var verifyInfo by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(currentUser?.uid) {
        verifyDismissed = false
        verifyInfo = null
    }
    val showVerifyBanner = currentUser != null && currentUser?.isEmailVerified == false && !verifyDismissed
    val verifyEmailSentMessage = stringResource(R.string.auth_verify_email_sent)
    val authErrorGenericMessage = stringResource(R.string.auth_error_generic)

    val notificationPermission = rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)

    // ── ViewModels ──────────────────────────────────────────────
    val addViewModel: AddExpenseViewModel = hiltViewModel(activity)
    val categoryViewModel: CategoryViewModel = hiltViewModel(activity)
    val expenseViewModel: ExpenseViewModel = hiltViewModel(activity)
    val insightsViewModel: InsightsViewModel = hiltViewModel(activity)
    val authViewModel: AuthViewModel = hiltViewModel(activity)

    val overlay = rememberAppOverlayState(addViewModel, expenseViewModel)

    // Keyed on the time too, so a reminder-time change synced from another device
    // (which doesn't toggle dailyReminder) still reschedules the local WorkManager job.
    LaunchedEffect(dailyReminder, reminderHour, reminderMinute) {
        NotificationHelper.ensureChannel(context)
        if (dailyReminder) {
            ReminderScheduler.scheduleNext(context)
        } else {
            ReminderScheduler.cancel(context)
        }
    }

    LaunchedEffect(activity.intent) {
        if (activity.intent?.getBooleanExtra(NotificationHelper.EXTRA_OPEN_ADD, false) == true) {
            pendingOpenAdd = true
            activity.intent?.removeExtra(NotificationHelper.EXTRA_OPEN_ADD)
        }
    }

    val deletedMessage = stringResource(R.string.snackbar_transaction_deleted)
    val undoLabel = stringResource(R.string.snackbar_undo)
    val duplicatedMessage = stringResource(R.string.snackbar_transaction_duplicated)
    val savedMessage = stringResource(R.string.snackbar_transaction_saved)
    val updatedMessage = stringResource(R.string.snackbar_transaction_updated)
    val deleteFailedMessage = stringResource(R.string.snackbar_transaction_delete_failed)
    val duplicateFailedMessage = stringResource(R.string.snackbar_transaction_duplicate_failed)
    val verifyRequiredMessage = stringResource(R.string.auth_verify_required)
    fun showSnackbar(message: String) {
        scope.launch { snackbarHostState.showSnackbar(message) }
    }
    fun failureMessage(fallback: String, error: String?): String =
        if (error == "EMAIL_NOT_VERIFIED") verifyRequiredMessage else fallback


    // Seed once signed-in prefs (incl. locale) are ready — only after email verification
    // so Firestore category writes match security rules.
    LaunchedEffect(currentUser?.uid, currentUser?.isEmailVerified, preferencesReady) {
        if (currentUser == null || !preferencesReady || currentUser?.isEmailVerified != true) {
            return@LaunchedEffect
        }
        withContext(Dispatchers.IO) {
            runCatching { repository.ensureSeeded() }
        }
    }

    LaunchedEffect(pendingOpenAdd) {
        if (pendingOpenAdd) {
            overlay.openAddFlow()
            pendingOpenAdd = false
        }
    }

    if (!onboardingComplete) {
        OnboardingScreen(
            onComplete = {
                scope.launch { preferenceManager.setOnboardingComplete() }
            },
            onEnableReminders = {
                scope.launch {
                    preferenceManager.updateDailyReminder(true)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        !notificationPermission.status.isGranted
                    ) {
                        notificationPermission.launchPermissionRequest()
                    }
                    ReminderScheduler.scheduleNext(context)
                }
            }
        )
        return
    }

    // Sign-in is mandatory (matches web): the Firestore-backed repository has no
    // local fallback, so an unauthenticated session could neither load nor save data.
    if (currentUser == null || showAuthFromSettings) {
        AuthScreen(
            viewModel = authViewModel,
            onAuthenticated = { showAuthFromSettings = false },
            onDismiss = if (currentUser != null) {
                { showAuthFromSettings = false }
            } else {
                null
            },
        )
        return
    }

    val lifecycleOwner = LocalLifecycleOwner.current

    AppScreen {
        val primary = MaterialTheme.colorScheme.primary
        val isWide = isWideScreen()
        Scaffold(
            containerColor = Color.Transparent,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            snackbarHost = {
                SnackbarHost(snackbarHostState) { data ->
                    AppSnackbar(
                        snackbarData = data,
                        actionColor = primary,
                    )
                }
            },
            floatingActionButton = {
                AnimatedVisibility(
                    visible = overlay.showBottomNav && overlay.selectedTab == Route.ExpenseList && !isWide,
                    enter = scaleIn(initialScale = 0.86f) + fadeIn(),
                    exit = scaleOut(targetScale = 0.86f) + fadeOut(),
                ) {
                    AppFab(
                        onClick = { overlay.openAddFlow() },
                        icon = Icons.Rounded.Add,
                        contentDescription = stringResource(R.string.nav_add_transaction),
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                }
            },
            bottomBar = {
                if (overlay.showBottomNav) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.background),
                    ) {
                        MainBottomBar(
                            currentRoute = overlay.selectedTab,
                            onNavigate = { route ->
                                if (overlay.selectedTab != route) {
                                    overlay.selectedTab = route
                                }
                            },
                        )
                        Spacer(
                            Modifier
                                .fillMaxWidth()
                                .windowInsetsBottomHeight(WindowInsets.navigationBars)
                                .background(MaterialTheme.colorScheme.background),
                        )
                    }
                }
            }
        ) { innerPadding ->
            val layoutDirection = LocalLayoutDirection.current
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(
                        start = innerPadding.calculateStartPadding(layoutDirection),
                        end = innerPadding.calculateEndPadding(layoutDirection),
                        bottom = innerPadding.calculateBottomPadding()
                    )
            ) {
                // Offline / cloud-sync-error banner — same SyncErrorBanner used in Settings,
                // so there's one visual treatment for "something's wrong with sync" everywhere.
                AnimatedVisibility(visible = !isOnline) {
                    SyncErrorBanner(
                        error = stringResource(R.string.settings_sync_error_network),
                        onRetry = { preferencesCloudSync.retry() },
                        modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
                    )
                }
                AnimatedVisibility(visible = isOnline && showVerifyBanner) {
                    EmailVerifyBanner(
                        infoMessage = verifyInfo,
                        busy = verifyBusy,
                        onResend = {
                            scope.launch {
                                verifyBusy = true
                                verifyInfo = null
                                authRepository.sendEmailVerification()
                                    .onSuccess { verifyInfo = verifyEmailSentMessage }
                                    .onFailure { verifyInfo = authErrorGenericMessage }
                                verifyBusy = false
                            }
                        },
                        onRefresh = {
                            scope.launch {
                                verifyBusy = true
                                verifyInfo = null
                                authRepository.reloadCurrentUser()
                                    .onFailure { verifyInfo = authErrorGenericMessage }
                                verifyBusy = false
                            }
                        },
                        onDismiss = { verifyDismissed = true },
                        modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
                    )
                }
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                MainTabPager(
                    currentRoute = overlay.selectedTab,
                    onRouteChange = { route ->
                        if (overlay.selectedTab != route) {
                            overlay.selectedTab = route
                        }
                    },
                    recordContent = {
                        RecordScreen(
                            viewModel = expenseViewModel,
                            currencyCode = currency,
                            dataError = listenerError,
                            onRetryDataError = { repository.retryListeners() },
                            onAddTransaction = overlay::openAddFlow,
                            onExpenseClick = overlay::openEditFlow,
                            onExpenseDeleted = { expense ->
                                scope.launch {
                                    val result = snackbarHostState.showSnackbar(
                                        message = deletedMessage,
                                        actionLabel = undoLabel,
                                        duration = SnackbarDuration.Short
                                    )
                                    if (result == SnackbarResult.ActionPerformed) {
                                        expenseViewModel.undoSoftDelete(expense)
                                    } else {
                                        expenseViewModel.commitSoftDelete(expense) { success, error ->
                                            if (!success) {
                                                showSnackbar(failureMessage(deleteFailedMessage, error))
                                            }
                                        }
                                    }
                                }
                            },
                            onExpenseDeleteFailed = { error ->
                                showSnackbar(failureMessage(deleteFailedMessage, error))
                            },
                            onExpenseDuplicated = {
                                showSnackbar(duplicatedMessage)
                            },
                            onExpenseDuplicateFailed = { error ->
                                showSnackbar(failureMessage(duplicateFailedMessage, error))
                            }
                        )
                    },
                    billsContent = {
                        BillsScreen(
                            viewModel = insightsViewModel,
                            currencyCode = currency,
                            dataError = listenerError,
                            onRetryDataError = { repository.retryListeners() },
                            onAddTransaction = overlay::openAddFlow,
                        )
                    },
                    settingsContent = {
                        SettingsScreen(
                            repository = repository,
                            preferenceManager = preferenceManager,
                            authRepository = authRepository,
                            authViewModel = authViewModel,
                            syncError = prefsSyncError,
                            onRetrySync = { preferencesCloudSync.retry() },
                            onNavigateToCategories = {
                                overlay.overlayStack.clear()
                                overlay.overlayStack.add(Route.CategoryList)
                            },
                            onShowMessage = ::showSnackbar,
                            onRequestNotificationPermission = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                    !notificationPermission.status.isGranted
                                ) {
                                    notificationPermission.launchPermissionRequest()
                                }
                            },
                            onRequestSignIn = { showAuthFromSettings = true },
                        )
                    }
                )

                MainOverlayHost(
                    visible = overlay.currentOverlay != null,
                    content = {
                        if (overlay.overlayStack.contains(Route.AddTransaction)) {
                            AddTransactionScreen(
                                viewModel = addViewModel,
                                categoryViewModel = categoryViewModel,
                                currencyCode = currency,
                                onTransactionSaved = { wasEditing ->
                                    overlay.closeOverlay()
                                    showSnackbar(if (wasEditing) updatedMessage else savedMessage)
                                },
                                onBack = {
                                    addViewModel.resetForm()
                                    overlay.closeOverlay()
                                },
                                onValidationError = { message -> showSnackbar(message) },
                                onBudgetAlert = { message -> showSnackbar(message) }
                            )
                        }

                        if (overlay.currentOverlay == Route.CategoryList) {
                            CategoryScreen(
                                viewModel = categoryViewModel,
                                onBack = overlay::closeOverlay,
                                onShowMessage = ::showSnackbar
                            )
                        }
                    },
                )
                }
            }
        }
    }
}

@Composable
private fun MainOverlayHost(
    visible: Boolean,
    content: @Composable () -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { it / 2 }, animationSpec = tween(400, easing = EaseOutQuart)) + fadeIn(animationSpec = tween(300)),
        exit = slideOutVertically(targetOffsetY = { it / 2 }, animationSpec = tween(350, easing = EaseInQuart)) + fadeOut(animationSpec = tween(250)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            content = { content() },
        )
    }
}
