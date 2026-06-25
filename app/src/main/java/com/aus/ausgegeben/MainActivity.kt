package com.aus.ausgegeben

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import com.aus.ausgegeben.R
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.AusgegebenDatabase
import com.aus.ausgegeben.data.DataSeeder
import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.notification.NotificationHelper
import com.aus.ausgegeben.notification.ReminderScheduler
import com.aus.ausgegeben.ui.AddExpenseViewModel
import com.aus.ausgegeben.ui.AddTransactionScreen
import com.aus.ausgegeben.ui.BillsScreen
import com.aus.ausgegeben.ui.CameraScreen
import com.aus.ausgegeben.ui.CategoryScreen
import com.aus.ausgegeben.ui.CategoryViewModel
import com.aus.ausgegeben.ui.DashboardViewModel
import com.aus.ausgegeben.ui.ExpenseViewModel
import com.aus.ausgegeben.ui.OnboardingScreen
import com.aus.ausgegeben.ui.RecordScreen
import com.aus.ausgegeben.ui.Route
import com.aus.ausgegeben.ui.SettingsScreen
import com.aus.ausgegeben.ui.components.AppScreen
import com.aus.ausgegeben.ui.components.CameraPermissionDenied
import com.aus.ausgegeben.ui.components.MainBottomBar
import com.aus.ausgegeben.ui.components.MainTabPager
import com.aus.ausgegeben.ui.openAddTransaction
import com.aus.ausgegeben.ui.isMainTab
import com.aus.ausgegeben.ui.theme.AusgegebenTheme
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val context = LocalContext.current
            val database = remember { AusgegebenDatabase.getDatabase(context) }
            val repository = remember {
                AppRepository(
                    database.categoryDao(),
                    database.expenseDao(),
                    context.applicationContext
                )
            }
            val preferenceManager = remember { PreferenceManager(context) }

            val themeMode by preferenceManager.themeModeFlow.collectAsState(initial = ThemeMode.SYSTEM)

            AusgegebenTheme(themeMode = themeMode) {
                LaunchedEffect(Unit) {
                    DataSeeder.seedIfEmpty(repository)
                    repository.repairBrokenCategoryColors()
                }
                MainApp(
                    repository = repository,
                    preferenceManager = preferenceManager,
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
    openAddFromNotification: Boolean = false
) {
    val context = LocalContext.current
    val activity = context as ComponentActivity
    val homeRoute = Route.ExpenseList as NavKey
    val backStack = rememberNavBackStack(homeRoute)
    val currentRoute = backStack.lastOrNull() as? Route ?: Route.ExpenseList
    val showBottomNav = currentRoute.isMainTab()
    val currency by preferenceManager.currencyFlow.collectAsState(initial = "EUR")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsState(initial = true)
    val onboardingComplete by preferenceManager.onboardingCompleteFlow.collectAsState(initial = false)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var pendingOpenAdd by remember { mutableStateOf(openAddFromNotification) }

    val notificationPermission = rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)

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

    fun showSnackbar(message: String) {
        scope.launch { snackbarHostState.showSnackbar(message) }
    }

    val addViewModel: AddExpenseViewModel = viewModel(activity) {
        AddExpenseViewModel(activity.application, repository, preferenceManager)
    }
    val categoryViewModel: CategoryViewModel = viewModel(activity) {
        CategoryViewModel(repository)
    }
    val expenseViewModel: ExpenseViewModel = viewModel(activity) {
        ExpenseViewModel(repository, preferenceManager)
    }
    val dashboardViewModel: DashboardViewModel = viewModel(activity) {
        DashboardViewModel(repository, preferenceManager)
    }
    val recordCategories by addViewModel.categories.collectAsState()

    fun openAddFlow() {
        addViewModel.resetForm()
        backStack.openAddTransaction(homeRoute)
    }

    LaunchedEffect(pendingOpenAdd) {
        if (pendingOpenAdd) {
            openAddFlow()
            pendingOpenAdd = false
        }
    }

    val overlayEntryProvider = entryProvider {
        entry<Route.Dashboard> {
            AddTransactionScreen(
                viewModel = addViewModel,
                categoryViewModel = categoryViewModel,
                currencyCode = currency,
                onTransactionSaved = { wasEditing ->
                    backStack.setNavBackStack(listOf(Route.ExpenseList as NavKey))
                    showSnackbar(if (wasEditing) updatedMessage else savedMessage)
                },
                onBack = {
                    addViewModel.resetForm()
                    backStack.popOrGoHome(homeRoute)
                },
                onOpenCamera = { backStack.push(Route.Camera as NavKey) },
                onValidationError = { message -> showSnackbar(message) },
                onBudgetAlert = { message -> showSnackbar(message) }
            )
        }
        entry<Route.CategoryList> {
            CategoryScreen(
                viewModel = categoryViewModel,
                onBack = { backStack.popOrGoHome(homeRoute) }
            )
        }
        entry<Route.Camera> {
            val permissionState = rememberPermissionState(Manifest.permission.CAMERA)
            var askedOnce by remember { mutableStateOf(false) }

            LaunchedEffect(permissionState.status.isGranted) {
                if (!permissionState.status.isGranted && !askedOnce) {
                    permissionState.launchPermissionRequest()
                    askedOnce = true
                }
            }

            when {
                permissionState.status.isGranted -> {
                    CameraScreen(
                        onImageCaptured = { uri ->
                            addViewModel.setReceiptPath(uri.toString())
                            if (backStack.size > 1) {
                                backStack.removeLastOrNull()
                            }
                        },
                        onBack = { backStack.popOrGoHome(homeRoute) }
                    )
                }
                else -> {
                    CameraPermissionDenied(
                        onRetry = { permissionState.launchPermissionRequest() },
                        onBack = { backStack.popOrGoHome(homeRoute) }
                    )
                }
            }
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

    AppScreen {
        Scaffold(
            containerColor = Color.Transparent,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = {
                if (showBottomNav) {
                    Box(modifier = Modifier.navigationBarsPadding()) {
                        MainBottomBar(
                            currentRoute = currentRoute,
                            showAddButton = currentRoute == Route.ExpenseList,
                            onAddTransaction = ::openAddFlow,
                            onNavigate = { route ->
                                if (currentRoute != route) {
                                    backStack.setNavBackStack(listOf(route as NavKey))
                                }
                            }
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
                if (currentRoute.isMainTab()) {
                    MainTabPager(
                        currentRoute = currentRoute,
                        onTabSelected = { route ->
                            if (currentRoute != route) {
                                backStack.setNavBackStack(listOf(route))
                            }
                        },
                        recordContent = {
                            RecordScreen(
                                viewModel = expenseViewModel,
                                currencyCode = currency,
                                onAddTransaction = ::openAddFlow,
                                onExpenseClick = { expense ->
                                    addViewModel.loadForEdit(expense, recordCategories)
                                    backStack.openAddTransaction(homeRoute)
                                },
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
                                onExpenseDuplicated = {
                                    showSnackbar(duplicatedMessage)
                                }
                            )
                        },
                        billsContent = {
                            BillsScreen(
                                viewModel = dashboardViewModel,
                                currencyCode = currency
                            )
                        },
                        settingsContent = {
                            SettingsScreen(
                                repository = repository,
                                preferenceManager = preferenceManager,
                                onNavigateToCategories = {
                                    backStack.setNavBackStack(
                                        listOf(Route.Settings as NavKey, Route.CategoryList as NavKey)
                                    )
                                },
                                onShowMessage = ::showSnackbar,
                                onRequestNotificationPermission = {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                                        !notificationPermission.status.isGranted
                                    ) {
                                        notificationPermission.launchPermissionRequest()
                                    }
                                }
                            )
                        }
                    )
                } else {
                    NavDisplay(
                        backStack = backStack,
                        entryProvider = { key ->
                            @Suppress("UNCHECKED_CAST")
                            val provider = overlayEntryProvider as (NavKey) ->
                                androidx.navigation3.runtime.NavEntry<NavKey>
                            provider(key)
                        },
                        onBack = { backStack.popOrGoHome(homeRoute) }
                    )
                }
            }
        }
    }
}

fun NavBackStack<NavKey>.setNavBackStack(newElements: List<NavKey>) {
    clear()
    addAll(newElements)
}

fun NavBackStack<NavKey>.push(route: NavKey) {
    if (lastOrNull() != route) {
        add(route)
    }
}

fun NavBackStack<NavKey>.popOrGoHome(home: NavKey) {
    if (size <= 1) {
        setNavBackStack(listOf(home))
    } else {
        removeLastOrNull()
    }
}
