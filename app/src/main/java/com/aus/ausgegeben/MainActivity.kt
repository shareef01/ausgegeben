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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
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

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val context = LocalContext.current
            val preferenceManager = remember { PreferenceManager(context) }
            val authRepository = remember { AuthRepository(context.applicationContext) }
            val preferencesCloudSync = remember { PreferencesCloudSync(preferenceManager) }
            val repository = remember {
                AppRepository(
                    appContext = context.applicationContext,
                    authRepository = authRepository,
                )
            }
            val syncScope = rememberCoroutineScope()
            val currentUser by authRepository.authState.collectAsState(initial = authRepository.currentUser)

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

            val themeMode by preferenceManager.themeModeFlow.collectAsState(initial = ThemeMode.SYSTEM)

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
    val currency by preferenceManager.currencyFlow.collectAsState(initial = "EUR")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsState(initial = true)
    val onboardingComplete by preferenceManager.onboardingCompleteFlow.collectAsState(initial = false)
    val authGatewayComplete by preferenceManager.authGatewayCompleteFlow.collectAsState(initial = false)
    val isOnline by ConnectivityObserver.observe(context).collectAsState(initial = true)
    val prefsSyncError by preferencesCloudSync.syncError.collectAsState(initial = null)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var pendingOpenAdd by remember { mutableStateOf(openAddFromNotification) }
    var showAuthFromSettings by remember { mutableStateOf(false) }

    val notificationPermission = rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)

    // ── ViewModels ──────────────────────────────────────────────
    val addViewModel: AddExpenseViewModel = viewModel(activity) {
        AddExpenseViewModel(activity.application, repository, preferenceManager)
    }
    val categoryViewModel: CategoryViewModel = viewModel(activity) {
        CategoryViewModel(activity.application, repository)
    }
    val expenseViewModel: ExpenseViewModel = viewModel(activity) {
        ExpenseViewModel(repository, preferenceManager)
    }
    val dashboardViewModel: DashboardViewModel = viewModel(activity) {
        DashboardViewModel(repository, preferenceManager)
    }
    val authViewModel: AuthViewModel = viewModel(activity) {
        AuthViewModel(activity.application, authRepository, preferenceManager, repository)
    }

    val overlay = rememberAppOverlayState(addViewModel, expenseViewModel)

    LaunchedEffect(dailyReminder) {
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

    fun showSnackbar(message: String) {
        scope.launch { snackbarHostState.showSnackbar(message) }
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

    if (!authGatewayComplete || showAuthFromSettings) {
        AuthScreen(
            viewModel = authViewModel,
            onAuthenticated = { showAuthFromSettings = false },
            onDismiss = if (authGatewayComplete) {
                { showAuthFromSettings = false }
            } else {
                null
            },
        )
        return
    }

    LaunchedEffect(repository) {
        withContext(Dispatchers.IO) {
            repository.ensureSeeded()
        }
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
            Box(
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
                AnimatedVisibility(
                    visible = !isOnline,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm)
                ) {
                    SyncErrorBanner(
                        error = stringResource(R.string.settings_sync_error_network),
                        onRetry = { preferencesCloudSync.retry() },
                    )
                }
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
                                        expenseViewModel.restoreExpense(expense)
                                    } else {
                                        expenseViewModel.finalizeDeletedExpense(expense)
                                    }
                                }
                            },
                            onExpenseDeleteFailed = {
                                showSnackbar(deleteFailedMessage)
                            },
                            onExpenseDuplicated = {
                                showSnackbar(duplicatedMessage)
                            },
                            onExpenseDuplicateFailed = {
                                showSnackbar(duplicateFailedMessage)
                            }
                        )
                    },
                    billsContent = {
                        BillsScreen(
                            viewModel = dashboardViewModel,
                            currencyCode = currency,
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

                AnimatedVisibility(
                    visible = overlay.currentOverlay != null,
                    enter = slideInVertically(initialOffsetY = { it / 2 }, animationSpec = tween(400, easing = EaseOutQuart)) + fadeIn(animationSpec = tween(300)),
                    exit = slideOutVertically(targetOffsetY = { it / 2 }, animationSpec = tween(350, easing = EaseInQuart)) + fadeOut(animationSpec = tween(250)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.background),
                    ) {
                        if (overlay.overlayStack.contains(Route.Dashboard)) {
                            AddTransactionScreen(
                                viewModel = addViewModel,
                                categoryViewModel = categoryViewModel,
                                currencyCode = currency,
                                onTransactionSaved = { wasEditing ->
                                    overlay.closeOverlay()
                                    overlay.selectedTab = Route.ExpenseList
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

                    }
                }
            }
        }
    }
}
