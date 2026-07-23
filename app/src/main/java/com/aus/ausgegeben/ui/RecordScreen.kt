package com.aus.ausgegeben.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.Animatable
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.graphicsLayer
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import com.aus.ausgegeben.util.recordListDateRangeMillis

private object RecordAuroraTokens {
    @Composable
    fun slate() = readableSecondaryColor()

    @Composable
    fun hairline() = appDividerColor()

    @Composable
    fun labelStyle() = sectionLabelStyle()
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun RecordScreen(
    viewModel: ExpenseViewModel,
    currencyCode: String = "EUR",
    onExpenseDeleted: (Expense) -> Unit = {},
    onExpenseDeleteFailed: () -> Unit = {},
    onExpenseClick: (Expense) -> Unit = {},
    onExpenseDuplicated: () -> Unit = {},
    onExpenseDuplicateFailed: () -> Unit = {},
    onAddTransaction: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val allExpenses by viewModel.pagedExpenses.collectAsStateWithLifecycle(initialValue = emptyList<Expense>())
    
    // Performance: Memoize derived calculations
    val dayTotalsByDay = remember(uiState.dayTotalsByDay) { uiState.dayTotalsByDay }
    val categories = remember(uiState.data.categories) { uiState.data.categories }
    val categoryById = remember(categories) { categories.associateBy { it.id } }
    
    // Performance: Pre-calculate groupings for 120Hz scrolling
    val grouped = remember(allExpenses) { allExpenses.groupBy { localDayStartMillis(it.dateMillis) } }
    val sortedDays = remember(grouped) { grouped.keys.sortedDescending() }
    var expensePendingDelete by remember { mutableStateOf<Expense?>(null) }

    // Date headers follow the UI language, not the currency's home locale
    val locale = LocalConfiguration.current.locales[0]
    val dateFormat = remember(locale) { SimpleDateFormat("dd MMM EEE", locale) }
    
    val allTimeLabel = stringResource(R.string.record_period_all_time)
    val listPeriodLabel = remember(uiState.toolbar.listPeriod, allTimeLabel) {
        when (uiState.toolbar.listPeriod) {
            RecordListPeriod.THIS_MONTH.key -> AnalyticsPeriod.THIS_MONTH.displayTitle()
            RecordListPeriod.ALL_TIME.key -> allTimeLabel
            else -> {
                val range = recordListDateRangeMillis(uiState.toolbar.listPeriod)
                if (range != null) {
                    val fmt = SimpleDateFormat("MMMM yyyy", Locale.getDefault())
                    fmt.format(Date(range.first))
                } else {
                    AnalyticsPeriod.THIS_MONTH.displayTitle()
                }
            }
        }
    }

    // Motion: Track period/filter changes to trigger list stagger
    val entranceKey = remember(uiState.toolbar.listPeriod, uiState.toolbar.typeFilter) { Any() }

    val scope = rememberCoroutineScope()
    val haptics = rememberAppHaptics()
    val isWide = isWideScreen()
    
    var isSearchExpanded by remember { mutableStateOf(false) }
    var isFilterExpanded by remember { mutableStateOf(false) }

    // Pillar 1: Ambient Aurora Wrap
    Box(modifier = modifier.fillMaxSize().background(AppAurora.background())) {
        Box(modifier = Modifier.fillMaxSize().background(AppAurora.brush(opacity = if (isAppDarkTheme()) 0.15f else 0.1f, center = Offset(1000f, 0f))))

        // Law: Centered Monolith constraint for large displays
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = if (isWide) 32.dp else 0.dp),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxHeight()
                    .widthIn(max = 800.dp),
                contentPadding = recordListBottomPadding()
            ) {
                if (isWide) {
                    item(key = "title") {
                        ScreenTitle(
                            title = stringResource(R.string.nav_record),
                            action = {
                                AppButton(
                                    onClick = onAddTransaction,
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
                                ) {
                                    Text(stringResource(R.string.nav_add_transaction))
                                }
                            },
                        )
                    }
                }

                item(key = "hero") {
                    val headerExpenses = uiState.data.headerExpenses
                    val sequence = remember(headerExpenses) { headerExpenses.asSequence() }
                    
                    val expenseTotal = remember(sequence) { sequence.filter { it.isExpense() }.sumOf { it.amount } }
                    val incomeTotal = remember(sequence) { sequence.filter { it.isIncome() }.sumOf { it.amount } }
                    val net = remember(sequence) { 
                        sequence.filter { !it.isTransfer() }.let { seq ->
                            seq.filter { it.isIncome() }.sumOf { it.amount } - seq.filter { it.isExpense() }.sumOf { it.amount }
                        }
                    }
                    
                    FinanceSummaryCard(
                        expenseTotal = expenseTotal,
                        incomeTotal = incomeTotal,
                        net = net,
                        currencyCode = currencyCode,
                        periodLabel = listPeriodLabel,
                        animateChanges = true
                    )
                }

                uiState.data.monthlyBudget?.let { budget ->
                    item(key = "budget") {
                        val monthSpent = remember(uiState.data.monthExpenses) {
                            uiState.data.monthExpenses.asSequence().filter { it.isExpense() }.sumOf { it.amount }
                        }
                        BudgetProgressBar(
                            spent = monthSpent,
                            budget = budget,
                            currencyCode = currencyCode,
                        )
                    }
                }

                stickyHeader(key = "toolbar") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(AppAurora.background())
                    ) {
                        RecordListToolbar(
                            listPeriod = uiState.toolbar.listPeriod,
                            listPeriodLabel = listPeriodLabel,
                            onListPeriod = viewModel::setListPeriod,
                            typeFilter = uiState.toolbar.typeFilter,
                            onTypeFilter = viewModel::setTypeFilter,
                            searchQuery = uiState.toolbar.searchQuery,
                            onSearchChange = viewModel::setSearchQuery,
                            isSearchExpanded = isSearchExpanded,
                            onSearchToggle = { isSearchExpanded = it },
                            isFilterExpanded = isFilterExpanded,
                            onFilterToggle = { isFilterExpanded = it }
                        )
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = RecordAuroraTokens.hairline(),
                        )
                    }
                }

                item { Spacer(Modifier.height(24.dp)) }

                if (allExpenses.isNotEmpty()) {
                    uiState.insights.topExpenseCategoryName?.let { name ->
                        item(key = "insight") {
                            val mostSpentLabel = stringResource(R.string.record_most_spent_on, name)
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                                    .appGlassCard(shape = RoundedCornerShape(AppRadius.interactive))
                                    .padding(horizontal = 14.dp, vertical = 10.dp)
                                    .semantics { contentDescription = mostSpentLabel },
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(24.dp)
                                            .appGlassCard(CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Insights,
                                            contentDescription = null,
                                            tint = financeExpenseColor(),
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                    Text(
                                        text = mostSpentLabel.uppercase(),
                                        style = RecordAuroraTokens.labelStyle(),
                                    )
                                }
                            }
                        }
                    }

                    sortedDays.forEachIndexed { dayIdx, dayStart ->
                        val dayExpenses = grouped[dayStart] ?: emptyList()
                        val dateLabel = dateFormat.format(Date(dayStart))
                        
                        item(key = "day-$dayStart") {
                            val revealAlpha = remember(entranceKey, dayIdx) { Animatable(0f) }
                            val revealOffset = remember(entranceKey, dayIdx) { Animatable(32f) }
                            
                            LaunchedEffect(entranceKey) {
                                val delay = dayIdx.coerceAtMost(8) * 45
                                launch {
                                    revealAlpha.animateTo(1f, tween(500, delayMillis = delay))
                                }
                                launch {
                                    revealOffset.animateTo(0f, spring(Spring.DampingRatioLowBouncy, Spring.StiffnessMediumLow))
                                }
                            }
                            
                            Column(
                                modifier = Modifier
                                    .graphicsLayer { 
                                        alpha = revealAlpha.value
                                        translationY = revealOffset.value
                                    }
                            ) {
                                DateSectionHeader(
                                    dateLabel,
                                    dayTotalsByDay[dayStart] ?: (0.0 to 0.0),
                                    currencyCode,
                                )
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp)
                                        .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
                                ) {
                                    dayExpenses.forEachIndexed { rowIndex, expense ->
                                        val category = categoryById[expense.categoryId]
                                        SwipeableTransactionRow(
                                            expense = expense,
                                            categoryName = category?.name ?: stringResource(R.string.record_unknown_category),
                                            categoryColor = category?.colorInt,
                                            icon = iconForCategory(category?.iconName, category?.name),
                                            currencyCode = currencyCode,
                                            onClick = { onExpenseClick(expense) },
                                            onLongClick = {
                                                viewModel.duplicateExpense(expense) { success ->
                                                    if (success) onExpenseDuplicated() else onExpenseDuplicateFailed()
                                                }
                                            },
                                            onDeleteRequest = { expensePendingDelete = expense },

                                        )
                                        if (rowIndex < dayExpenses.lastIndex) {
                                            HorizontalDivider(
                                                modifier = Modifier.fillMaxWidth(),
                                                thickness = 0.5.dp,
                                                color = RecordAuroraTokens.hairline(),
                                            )
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                            }
                        }
                    }
                } else {
                    val isSearching = uiState.toolbar.searchQuery.isNotBlank()
                    item(key = "empty") {
                        EmptyStateMessage(
                            icon = if (isSearching) Icons.Rounded.SearchOff else Icons.AutoMirrored.Rounded.List,
                            title = stringResource(if (isSearching) R.string.record_no_matches_title else R.string.record_empty_title),
                            subtitle = stringResource(if (isSearching) R.string.record_no_matches_subtitle else R.string.record_empty_subtitle),
                            actionLabel = if (isSearching) stringResource(R.string.record_error_retry) else stringResource(R.string.record_empty_action),
                            onAction = if (isSearching) { { viewModel.setSearchQuery("") } } else onAddTransaction
                        )
                    }
                }
            }
        }
    }

    if (expensePendingDelete != null) {
        AppDestructiveConfirmDialog(
            onDismissRequest = { expensePendingDelete = null },
            title = {
                Text(
                    stringResource(R.string.record_delete_title),
                    style = MaterialTheme.typography.titleMedium,
                )
            },
            text = {
                AppDialogBodyText(stringResource(R.string.record_delete_message))
            },
            confirmLabel = stringResource(R.string.record_delete_confirm),
            dismissLabel = stringResource(R.string.record_delete_cancel),
            onConfirm = {
                expensePendingDelete?.let {
                    viewModel.deleteExpense(it) { success ->
                        if (success) onExpenseDeleted(it) else onExpenseDeleteFailed()
                    }
                }
                expensePendingDelete = null
            },
        )
    }
}

@Composable
private fun RecordListToolbar(
    listPeriod: String,
    listPeriodLabel: String,
    onListPeriod: (String) -> Unit,
    typeFilter: TransactionTypeFilter,
    onTypeFilter: (TransactionTypeFilter) -> Unit,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    isSearchExpanded: Boolean,
    onSearchToggle: (Boolean) -> Unit,
    isFilterExpanded: Boolean,
    onFilterToggle: (Boolean) -> Unit,
) {
    val typeFilterLabels = TransactionTypeFilter.entries.map { it.label }
    val typeFilterIndex = TransactionTypeFilter.entries.indexOf(typeFilter).coerceAtLeast(0)
    val isMonthPeriod = listPeriod.startsWith("month:")
    var showMonthSheet by remember { mutableStateOf(false) }
    // Same 12-month sheet as Bills so Record can scope the list to any month (parity with web)
    val monthPickerOptions = remember { analyticsPeriodOptions(monthsBack = 12) }
    val currentMonthKey = remember(monthPickerOptions) {
        monthPickerOptions.firstOrNull { it.storageKey != "all_time" }?.storageKey
    }

    if (showMonthSheet) {
        PeriodPickerSheet(
            options = monthPickerOptions,
            selectedKey = if (listPeriod == RecordListPeriod.THIS_MONTH.key) currentMonthKey ?: listPeriod else listPeriod,
            onSelected = { option ->
                onListPeriod(
                    if (option.storageKey == currentMonthKey) RecordListPeriod.THIS_MONTH.key
                    else option.storageKey,
                )
            },
            onDismiss = { showMonthSheet = false },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .padding(horizontal = 16.dp)
            .appGlassCard(RoundedCornerShape(AppRadius.card))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val thisMonthLabel = stringResource(R.string.record_period_this_month)
        val allTimeLabel = stringResource(R.string.record_period_all_time)
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AnimatedContent(
                targetState = isSearchExpanded,
                transitionSpec = {
                    fadeIn(animationSpec = tween(220, delayMillis = 90)) + scaleIn(initialScale = 0.92f, animationSpec = tween(220, delayMillis = 90)) togetherWith
                    fadeOut(animationSpec = tween(90))
                },
                label = "toolbarSearchAnim",
                modifier = Modifier.weight(1f)
            ) { expanded ->
                if (!expanded) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (isMonthPeriod) {
                            // Active month scope — chip with a clear affordance back to "this month"
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .appGlassCard(RoundedCornerShape(AppRadius.pill))
                                    .border(
                                        0.5.dp,
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
                                        RoundedCornerShape(AppRadius.pill),
                                    )
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    Icons.Rounded.CalendarMonth,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp),
                                )
                                Text(
                                    text = listPeriodLabel.lowercase(),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .smoothClickable { onListPeriod(RecordListPeriod.THIS_MONTH.key) },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        Icons.Rounded.Close,
                                        contentDescription = stringResource(R.string.record_clear_month_filter),
                                        tint = navigationInactiveColor(),
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        } else {
                            IosSegmentedControl(
                                options = listOf(thisMonthLabel, allTimeLabel),
                                selectedIndex = if (listPeriod == RecordListPeriod.ALL_TIME.key) 1 else 0,
                                onSelected = { index ->
                                    onListPeriod(
                                        if (index == 0) RecordListPeriod.THIS_MONTH.key else RecordListPeriod.ALL_TIME.key,
                                    )
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .appGlassCard(CircleShape)
                                .smoothClickable { showMonthSheet = true },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Rounded.CalendarMonth,
                                contentDescription = stringResource(R.string.record_pick_month),
                                tint = if (isMonthPeriod) MaterialTheme.colorScheme.primary else navigationInactiveColor(),
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .appGlassCard(CircleShape)
                                .smoothClickable { onSearchToggle(true) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Rounded.Search,
                                contentDescription = stringResource(R.string.record_search),
                                tint = if (searchQuery.isNotBlank()) MaterialTheme.colorScheme.primary else navigationInactiveColor(),
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .appGlassCard(CircleShape)
                                .smoothClickable { onFilterToggle(!isFilterExpanded) },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Rounded.FilterList,
                                contentDescription = stringResource(R.string.record_filter),
                                tint = if (typeFilter != TransactionTypeFilter.ALL) MaterialTheme.colorScheme.primary else navigationInactiveColor(),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .appGlassCard(RoundedCornerShape(AppRadius.interactive))
                                .border(0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f), RoundedCornerShape(AppRadius.interactive))
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Rounded.Search,
                                null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            BasicTextField(
                                value = searchQuery,
                                onValueChange = onSearchChange,
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(
                                    color = MaterialTheme.colorScheme.onSurface,
                                ),
                                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(onSearch = { }),
                                decorationBox = { inner ->
                                    if (searchQuery.isEmpty()) {
                                        Text(
                                            text = stringResource(R.string.record_search_placeholder),
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = readableSecondaryColor().copy(alpha = 0.7f),
                                        )
                                    }
                                    inner()
                                },
                            )
                            if (searchQuery.isNotBlank()) {
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .smoothClickable { onSearchChange("") },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        Icons.Rounded.Close,
                                        null,
                                        tint = navigationInactiveColor(),
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                        
                        Text(
                            text = stringResource(R.string.action_cancel).lowercase(),
                            style = MaterialTheme.typography.labelLarge.copy(color = MaterialTheme.colorScheme.primary),
                            modifier = Modifier.smoothClickable { 
                                onSearchToggle(false)
                                onSearchChange("")
                            }
                        )
                    }
                }
            }
        }

        if (isFilterExpanded || typeFilter != TransactionTypeFilter.ALL) {
            IosSegmentedControl(
                options = typeFilterLabels,
                selectedIndex = typeFilterIndex,
                onSelected = { index ->
                    TransactionTypeFilter.entries.getOrNull(index)?.let(onTypeFilter)
                },
            )
        }
    }
}

@Composable
private fun DateSectionHeader(
    date: String,
    dayTotals: Pair<Double, Double>,
    currencyCode: String,
    modifier: Modifier = Modifier
) {
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.md))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Anchor point
            Box(
                modifier = Modifier
                    .size(4.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape)
            )
            Spacer(Modifier.width(8.dp))

            Text(
                text = date.uppercase(),
                style = RecordAuroraTokens.labelStyle(),
                modifier = Modifier.weight(1f),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                val (dayIncome, dayExpense) = dayTotals
                if (dayIncome > 0) {
                    Text(
                        text = "+" + CurrencyUtils.formatAmount(dayIncome, currencyCode),
                        style = MaterialTheme.typography.labelLarge.copy(
                            color = incomeColor,
                            textAlign = TextAlign.End,
                        ),
                    )
                }
                if (dayExpense > 0) {
                    Text(
                        text = "-" + CurrencyUtils.formatAmount(dayExpense, currencyCode),
                        style = MaterialTheme.typography.labelLarge.copy(
                            color = expenseColor,
                            textAlign = TextAlign.End,
                        ),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun SwipeableTransactionRow(
    expense: Expense,
    categoryName: String,
    categoryColor: Int?,
    icon: ImageVector,
    currencyCode: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onDeleteRequest: () -> Unit
) {
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val haptics = rememberAppHaptics()
    val deleteColor = financeExpenseColor()
    val editSwipeColor = MaterialTheme.colorScheme.primary

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { 
            when (it) {
                SwipeToDismissBoxValue.EndToStart -> {
                    onDeleteRequest()
                    haptics.medium()
                    false // Return to center
                }
                SwipeToDismissBoxValue.StartToEnd -> {
                    onClick()
                    haptics.light()
                    false
                }
                else -> true
            }
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = true, // Law: Enable Swipe-to-Edit
        backgroundContent = {
            val direction = dismissState.dismissDirection
            val swipeFraction = dismissState.progress.coerceIn(0f, 1f)
            
            when (direction) {
                SwipeToDismissBoxValue.EndToStart -> {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .background(deleteColor.copy(alpha = swipeFraction))
                            .padding(horizontal = 24.dp),
                        contentAlignment = Alignment.CenterEnd
                    ) {
                        val iconScale by animateFloatAsState(
                            targetValue = if (swipeFraction > 0.5f) 1.2f else 1.0f,
                            animationSpec = spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium),
                            label = "deleteIconScale"
                        )
                        Icon(
                            Icons.Rounded.Delete,
                            null,
                            tint = contrastColorOn(deleteColor).copy(alpha = swipeFraction.coerceAtLeast(0.35f)),
                            modifier = Modifier
                                .size(24.dp)
                                .graphicsLayer {
                                    scaleX = iconScale
                                    scaleY = iconScale
                                },
                        )
                    }
                }
                SwipeToDismissBoxValue.StartToEnd -> {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .background(editSwipeColor.copy(alpha = swipeFraction))
                            .padding(horizontal = 24.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        val iconScale by animateFloatAsState(
                            targetValue = if (swipeFraction > 0.5f) 1.2f else 1.0f,
                            animationSpec = spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium),
                            label = "editIconScale"
                        )
                        Icon(
                            Icons.Rounded.Edit,
                            null,
                            tint = contrastColorOn(editSwipeColor).copy(alpha = swipeFraction.coerceAtLeast(0.35f)),
                            modifier = Modifier
                                .size(24.dp)
                                .graphicsLayer {
                                    scaleX = iconScale
                                    scaleY = iconScale
                                },
                        )
                    }
                }
                else -> {}
            }
        }
    ) {
        // Pillar 2: The Foreground Layer (The Data)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .animateContentSize(animationSpec = spring(stiffness = Spring.StiffnessMediumLow))
                .background(Color.Transparent)
                .combinedClickable(
                    onClick = {
                        haptics.light()
                        onClick()
                    },
                    onLongClick = {
                        haptics.medium()
                        onLongClick()
                    },
                )
        ) {
            TransactionRow(
                expense,
                categoryName,
                categoryColor,
                icon,
                currencyCode,
                incomeColor,
                expenseColor,
            )
        }
    }
}

@Composable
fun TransactionRow(
    expense: Expense,
    categoryName: String,
    categoryColor: Int?,
    icon: ImageVector,
    currencyCode: String,
    incomeColor: Color,
    expenseColor: Color,
) {
    val isIncome = expense.isIncome()
    val isTransfer = expense.isTransfer()
    val transferColor = financeTransferColor()
    
    val amountColor = when {
        isIncome -> incomeColor
        isTransfer -> transferColor
        else -> MaterialTheme.colorScheme.onSurface
    }
    
    val indicatorColor = categoryColor?.let { colorIntToCompose(it) }
        ?: if (isTransfer) transferColor else MaterialTheme.colorScheme.onSurface

    val rowDescription = stringResource(
        if (isIncome) R.string.desc_income_row else if (isTransfer) R.string.desc_transfer_row else R.string.desc_expense_row,
        categoryName,
        CurrencyUtils.formatAmount(expense.amount, currencyCode),
        if (expense.note.isNotBlank()) expense.note else ""
    )

    // Law 2: Ironclad Transaction Row Alignments
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min) // Pillar 4: Consistent vertical metrics
            .semantics { contentDescription = rowDescription },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Law 6: Category Spine
        Box(
            modifier = Modifier
                .width(3.dp)
                .fillMaxHeight()
                .padding(vertical = 12.dp)
                .clip(CircleShape)
                .background(indicatorColor.copy(alpha = 0.65f))
        )

        Spacer(Modifier.width(12.dp))

        // [Icon Box with Directional Overlay]
        Box(
            modifier = Modifier.padding(vertical = 16.dp),
            contentAlignment = Alignment.BottomEnd
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .appGlassCard(CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isTransfer) Icons.Rounded.SwapHoriz else icon,
                    contentDescription = null,
                    tint = indicatorColor,
                    modifier = Modifier.size(20.dp),
                )
            }
            
            if (isTransfer) {
                val badgeFill = transferColor.copy(alpha = 0.9f)
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.background)
                        .padding(1.5.dp)
                        .clip(CircleShape)
                        .background(badgeFill),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SwapHoriz,
                        contentDescription = null,
                        tint = contrastColorOn(badgeFill),
                        modifier = Modifier.size(10.dp),
                    )
                }
            } else {
                val badgeFill = if (isIncome) incomeColor else expenseColor
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.background)
                        .padding(1.5.dp)
                        .clip(CircleShape)
                        .background(badgeFill),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isIncome) Icons.Rounded.ArrowUpward else Icons.Rounded.ArrowDownward,
                        contentDescription = null,
                        tint = contrastColorOn(badgeFill),
                        modifier = Modifier.size(10.dp)
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.width(12.dp))
        
        // [Column containing Category/Note]
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 16.dp)
                .padding(end = 8.dp)
        ) {
            Text(
                text = categoryName, 
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), 
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (expense.note.isNotBlank()) {
                Text(
                    text = expense.note, 
                    style = MaterialTheme.typography.labelMedium, 
                    color = RecordAuroraTokens.slate(), 
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        
        Spacer(Modifier.width(8.dp))

        // SECURE: Amount has a dedicated non-shrinking boundary to prevent overlap
        Text(
            text = when {
                isIncome -> "+" + CurrencyUtils.formatAmount(expense.amount, currencyCode)
                isTransfer -> CurrencyUtils.formatAmount(expense.amount, currencyCode)
                else -> "-" + CurrencyUtils.formatAmount(expense.amount, currencyCode)
            },
            modifier = Modifier
                .widthIn(min = 80.dp)
                .padding(end = 14.dp),
            style = TextStyle(
                fontSize = 15.sp, 
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
                color = amountColor,
                textAlign = TextAlign.End
            )
        )
    }
}
