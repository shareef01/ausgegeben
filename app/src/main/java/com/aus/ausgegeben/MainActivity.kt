package com.aus.ausgegeben

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalLifecycleOwner
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
            val repository = remember {
                AppRepository(
                    appContext = context.applicationContext,
                    authRepository = authRepository,
                )
            }

            val themeMode by preferenceManager.themeModeFlow.collectAsState(initial = ThemeMode.SYSTEM)

            AusgegebenTheme(themeMode = themeMode) {
                MainApp(
                    repository = repository,
                    preferenceManager = preferenceManager,
                    authRepository = authRepository,
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
    openAddFromNotification: Boolean = false
) {
    val context = LocalContext.current
    val activity = LocalActivity.current as? AppCompatActivity ?: return
    var selectedTab by remember { mutableStateOf<Route>(Route.ExpenseList) }
    val overlayStack = remember { mutableStateListOf<Route>() }
    val currentOverlay = overlayStack.lastOrNull()
    val showBottomNav = overlayStack.isEmpty()
    val currency by preferenceManager.currencyFlow.collectAsState(initial = "EUR")
    val dailyReminder by preferenceManager.dailyReminderFlow.collectAsState(initial = true)
    val onboardingComplete by preferenceManager.onboardingCompleteFlow.collectAsState(initial = false)
    val authGatewayComplete by preferenceManager.authGatewayCompleteFlow.collectAsState(initial = false)
    val storageMode by preferenceManager.storageModeFlow.collectAsState(initial = StorageMode.LOCAL)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var pendingOpenAdd by remember { mutableStateOf(openAddFromNotification) }
    var showAuthFromSettings by remember { mutableStateOf(false) }

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
    val authViewModel: AuthViewModel = viewModel(activity) {
        AuthViewModel(activity.application, authRepository, preferenceManager, repository)
    }

    fun closeOverlay() {
        overlayStack.clear()
    }

    fun popOverlay() {
        if (overlayStack.size <= 1) {
            closeOverlay()
        } else {
            overlayStack.removeLastOrNull()
        }
    }

    fun openAddFlow() {
        addViewModel.resetForm()
        overlayStack.clear()
        overlayStack.add(Route.Dashboard)
    }

    fun openEditFlow(expense: com.aus.ausgegeben.data.entity.Expense) {
        addViewModel.loadForEdit(expense, expenseViewModel.uiState.value.data.categories)
        overlayStack.clear()
        overlayStack.add(Route.Dashboard)
    }

    LaunchedEffect(pendingOpenAdd) {
        if (pendingOpenAdd) {
            openAddFlow()
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
        Scaffold(
            containerColor = Color.Transparent,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            snackbarHost = {
                SnackbarHost(snackbarHostState) { data ->
                    Snackbar(
                        snackbarData = data,
                        shape = RoundedCornerShape(AppRadius.md),
                        containerColor = MaterialTheme.colorScheme.inverseSurface,
                        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
                    )
                }
            },
            floatingActionButton = {
                AnimatedVisibility(
                    visible = showBottomNav && selectedTab == Route.ExpenseList,
                    enter = scaleIn(
                        initialScale = 0.86f,
                        animationSpec = spring(
                            dampingRatio = Spring.DampingRatioLowBouncy,
                            stiffness = Spring.StiffnessMedium
                        )
                    ) + fadeIn(animationSpec = spring(stiffness = Spring.StiffnessMedium)),
                    exit = scaleOut(
                        targetScale = 0.86f,
                        animationSpec = spring(stiffness = Spring.StiffnessHigh)
                    ) + fadeOut(animationSpec = spring(stiffness = Spring.StiffnessHigh)),
                ) {
                    // Pillar 4: Neon FAB with massive colored glow and spring physics
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .shadow(
                                elevation = 20.dp, 
                                spotColor = Color(0xFF10B981), 
                                ambientColor = Color(0xFF10B981).copy(alpha = 0.4f),
                                shape = CircleShape
                            )
                            .clip(CircleShape)
                            .background(
                                Brush.linearGradient(
                                    colors = listOf(Color(0xFF10B981), Color(0xFF047857))
                                )
                            )
                            .smoothClickable { openAddFlow() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = stringResource(R.string.nav_add_transaction),
                            tint = Color.White,
                            modifier = Modifier.size(32.dp),
                        )
                    }
                }
            },
            bottomBar = {
                if (showBottomNav) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.background),
                    ) {
                        MainBottomBar(
                            currentRoute = selectedTab,
                            onNavigate = { route ->
                                if (selectedTab != route) {
                                    selectedTab = route
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
                MainTabPager(
                    currentRoute = selectedTab,
                    onRouteChange = { route ->
                        if (selectedTab != route) {
                            selectedTab = route
                        }
                    },
                    recordContent = {
                        RecordScreen(
                            viewModel = expenseViewModel,
                            currencyCode = currency,
                            onAddTransaction = ::openAddFlow,
                            onExpenseClick = ::openEditFlow,
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
                            authRepository = authRepository,
                            authViewModel = authViewModel,
                            onNavigateToCategories = {
                                overlayStack.clear()
                                overlayStack.add(Route.CategoryList)
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
                    visible = currentOverlay != null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.background),
                    ) {
                        if (overlayStack.contains(Route.Dashboard)) {
                            AddTransactionScreen(
                                viewModel = addViewModel,
                                categoryViewModel = categoryViewModel,
                                currencyCode = currency,
                                onTransactionSaved = { wasEditing ->
                                    closeOverlay()
                                    selectedTab = Route.ExpenseList
                                    showSnackbar(if (wasEditing) updatedMessage else savedMessage)
                                },
                                onBack = {
                                    addViewModel.resetForm()
                                    closeOverlay()
                                },
                                onOpenCamera = {
                                    if (overlayStack.lastOrNull() != Route.Camera) {
                                        overlayStack.add(Route.Camera)
                                    }
                                },
                                onValidationError = { message -> showSnackbar(message) },
                                onBudgetAlert = { message -> showSnackbar(message) }
                            )
                        }

                        if (currentOverlay == Route.CategoryList) {
                            CategoryScreen(
                                viewModel = categoryViewModel,
                                onBack = ::closeOverlay
                            )
                        }

                        if (currentOverlay == Route.Camera) {
                            val permissionState = rememberPermissionState(Manifest.permission.CAMERA)
                            var askedOnce by remember { mutableStateOf(false) }

                            LaunchedEffect(permissionState.status.isGranted) {
                                if (!permissionState.status.isGranted && !askedOnce) {
                                    permissionState.launchPermissionRequest()
                                    askedOnce = true
                                }
                            }

                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(MaterialTheme.colorScheme.background)
                            ) {
                                when {
                                    permissionState.status.isGranted -> {
                                        CameraScreen(
                                            onImageCaptured = { uri ->
                                                addViewModel.setReceiptPath(uri.toString())
                                                popOverlay()
                                            },
                                            onBack = ::popOverlay
                                        )
                                    }
                                    else -> {
                                        CameraPermissionDenied(
                                            onRetry = { permissionState.launchPermissionRequest() },
                                            onBack = ::popOverlay
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
