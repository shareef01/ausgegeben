package com.aus.ausgegeben.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Expense
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import com.aus.ausgegeben.ui.components.BudgetProgressBar
import com.aus.ausgegeben.ui.components.EmptyStateMessage
import com.aus.ausgegeben.ui.components.InsightsStrip
import com.aus.ausgegeben.ui.components.IosSegmentedControl
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import com.aus.ausgegeben.ui.components.FinanceSummaryCard
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.IosSeparator
import com.aus.ausgegeben.ui.components.ReceiptImageDialog
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.recordListBottomPadding
import com.aus.ausgegeben.ui.theme.AmountTextStyle
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.TransferGray
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.RecordListPeriod
import com.aus.ausgegeben.util.displayTitle
import com.aus.ausgegeben.util.localDayStartMillis
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun dateFormatsFor(currencyCode: String): Pair<SimpleDateFormat, SimpleDateFormat> {
    val locale = CurrencyUtils.localeFor(currencyCode)
    return SimpleDateFormat("HH:mm", locale) to SimpleDateFormat("dd.MM EEE", locale)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecordScreen(
    viewModel: ExpenseViewModel,
    currencyCode: String = "EUR",
    onExpenseDeleted: (Expense) -> Unit = {},
    onExpenseClick: (Expense) -> Unit = {},
    onExpenseDuplicated: () -> Unit = {},
    onAddTransaction: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val lazyExpenses = viewModel.pagedExpenses.collectAsLazyPagingItems()
    val expenses = lazyExpenses.itemSnapshotList.items
    val allMonthExpenses = uiState.monthExpenses
    val categories = uiState.categories
    val categoryById = remember(categories) { categories.associateBy { it.id } }
    var receiptToView by remember { mutableStateOf<String?>(null) }
    var expensePendingDelete by remember { mutableStateOf<Expense?>(null) }
    val (timeFormat, dateFormat) = remember(currencyCode) { dateFormatsFor(currencyCode) }
    val monthLabel = remember { AnalyticsPeriod.THIS_MONTH.displayTitle() }
    val listPeriodLabel = when (uiState.listPeriod) {
        RecordListPeriod.THIS_MONTH -> monthLabel
        RecordListPeriod.ALL_TIME -> stringResource(R.string.record_period_all_time)
    }
    val monthSpent = remember(allMonthExpenses) {
        allMonthExpenses.filter { it.isExpense() }.sumOf { it.amount }
    }

    val groupedExpenses = remember(expenses) {
        expenses.groupBy {
            dateFormat.format(Date(localDayStartMillis(it.dateMillis)))
        }
    }
    val hasActiveFilter = uiState.searchQuery.isNotBlank() ||
        uiState.typeFilter != TransactionTypeFilter.ALL
    val isListLoading = lazyExpenses.loadState.refresh is LoadState.Loading
    val isListError = lazyExpenses.loadState.refresh is LoadState.Error
    val isListEmpty = lazyExpenses.itemCount == 0 &&
        lazyExpenses.loadState.refresh is LoadState.NotLoading

    Column(modifier = modifier.fillMaxSize()) {
        ScreenTitle(title = stringResource(R.string.screen_record))

        InsightsStrip(
            insights = uiState.insights,
            currencyCode = currencyCode
        )

        uiState.monthlyBudget?.let { budget ->
            BudgetProgressBar(
                spent = monthSpent,
                budget = budget,
                currencyCode = currencyCode
            )
        }

        RecordHeader(
            expenses = uiState.headerExpenses,
            currencyCode = currencyCode,
            periodLabel = listPeriodLabel
        )

        RecordListPeriodToggle(
            selected = uiState.listPeriod,
            onSelected = viewModel::setListPeriod
        )

        RecordSearchBar(
            query = uiState.searchQuery,
            onQueryChange = viewModel::setSearchQuery
        )

        RecordTypeFilters(
            selected = uiState.typeFilter,
            onSelected = viewModel::setTypeFilter
        )

        when {
            isListError -> {
                val error = lazyExpenses.loadState.refresh as LoadState.Error
                EmptyStateMessage(
                    icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                    title = stringResource(R.string.record_error_title),
                    subtitle = error.error.localizedMessage
                        ?: stringResource(R.string.record_error_retry),
                    actionLabel = stringResource(R.string.record_error_retry),
                    onAction = { lazyExpenses.retry() },
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 180.dp)
                )
            }
            isListLoading && isListEmpty -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            isListEmpty && hasActiveFilter -> {
                EmptyStateMessage(
                    icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                    title = stringResource(R.string.record_no_matches_title),
                    subtitle = stringResource(R.string.record_no_matches_subtitle),
                    modifier = Modifier
                        .weight(1f)
                        .defaultMinSize(minHeight = 180.dp)
                )
            }
            isListEmpty -> {
                EmptyRecordState(
                    onAddTransaction = onAddTransaction,
                    modifier = Modifier.weight(1f)
                )
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = recordListBottomPadding()
                ) {
                    groupedExpenses.forEach { (date, dayItems) ->
                        val billable = dayItems.filter { !it.isTransfer() }
                        val dayIncome = billable.filter { it.isIncome() }.sumOf { it.amount }
                        val dayExpense = billable.filter { it.isExpense() }.sumOf { it.amount }

                        item(key = "header-$date") {
                            DatePill(date, dayIncome, dayExpense, currencyCode)
                        }

                        item(key = "group-$date") {
                            GroupedSection(modifier = Modifier.padding(bottom = 12.dp)) {
                                Column(modifier = Modifier.clip(GroupedSectionClip)) {
                                    dayItems
                                        .sortedByDescending { it.dateMillis }
                                        .forEachIndexed { index, expense ->
                                            key(expense.id) {
                                                if (index > 0) IosSeparator()
                                                val category = categoryById[expense.categoryId]
                                                val time = timeFormat.format(Date(expense.dateMillis))
                                                val categoryName = category?.name
                                                    ?: stringResource(R.string.record_unknown_category)
                                                SwipeableTransactionRow(
                                                    expense = expense,
                                                    categoryName = categoryName,
                                                    categoryColor = category?.colorInt,
                                                    icon = iconForCategory(category?.iconName, category?.name),
                                                    time = time,
                                                    currencyCode = currencyCode,
                                                    onClick = { onExpenseClick(expense) },
                                                    onLongClick = {
                                                        viewModel.duplicateExpense(expense)
                                                        onExpenseDuplicated()
                                                    },
                                                    onDeleteRequest = {
                                                        expensePendingDelete = expense
                                                    },
                                                    onReceiptClick = expense.receiptImagePath?.let { path ->
                                                        { receiptToView = path }
                                                    }
                                                )
                                            }
                                        }
                                }
                            }
                        }
                    }
                    if (lazyExpenses.loadState.append is LoadState.Loading) {
                        item(key = "loading-footer") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(28.dp))
                            }
                        }
                    }
                }
            }
        }
    }

    receiptToView?.let { uri ->
        ReceiptImageDialog(uri = uri, onDismiss = { receiptToView = null })
    }

    expensePendingDelete?.let { expense ->
        AlertDialog(
            onDismissRequest = { expensePendingDelete = null },
            title = { Text(stringResource(R.string.record_delete_title)) },
            text = {
                Text(stringResource(R.string.record_delete_message))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteExpense(expense)
                        onExpenseDeleted(expense)
                        expensePendingDelete = null
                    }
                ) {
                    Text(
                        stringResource(R.string.record_delete_confirm),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { expensePendingDelete = null }) {
                    Text(stringResource(R.string.record_delete_cancel))
                }
            }
        )
    }
}

@Composable
private fun RecordListPeriodToggle(
    selected: RecordListPeriod,
    onSelected: (RecordListPeriod) -> Unit
) {
    val options = RecordListPeriod.entries
    IosSegmentedControl(
        options = options.map { it.label() },
        selectedIndex = options.indexOf(selected).coerceAtLeast(0),
        onSelected = { onSelected(options[it]) },
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
    )
}

@Composable
private fun RecordSearchBar(
    query: String,
    onQueryChange: (String) -> Unit
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        placeholder = { Text(stringResource(R.string.record_search_placeholder)) },
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = stringResource(R.string.record_search)) },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.record_clear_search))
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(14.dp)
    )
}

@Composable
private fun RecordTypeFilters(
    selected: TransactionTypeFilter,
    onSelected: (TransactionTypeFilter) -> Unit
) {
    val options = TransactionTypeFilter.entries
    IosSegmentedControl(
        options = options.map { it.label() },
        selectedIndex = options.indexOf(selected).coerceAtLeast(0),
        onSelected = { onSelected(options[it]) },
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

private val GroupedSectionClip = RoundedCornerShape(14.dp)

@Composable
private fun EmptyRecordState(
    onAddTransaction: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        EmptyStateMessage(
            icon = Icons.AutoMirrored.Rounded.ReceiptLong,
            title = stringResource(R.string.record_empty_title),
            subtitle = stringResource(R.string.record_empty_subtitle),
            actionLabel = stringResource(R.string.record_empty_action),
            onAction = onAddTransaction,
            modifier = Modifier.defaultMinSize(minHeight = 200.dp)
        )
        Row(
            modifier = Modifier
                .padding(horizontal = 24.dp, vertical = 8.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
        ) {
            GestureHintChip(text = stringResource(R.string.gesture_swipe_delete))
            GestureHintChip(text = stringResource(R.string.gesture_long_press_duplicate))
        }
    }
}

@Composable
private fun GestureHintChip(text: String) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

@Composable
fun RecordHeader(
    expenses: List<Expense>,
    currencyCode: String = "EUR",
    periodLabel: String = "all time"
) {
    val billable = expenses.filter { !it.isTransfer() }
    val totalExpense = billable.filter { it.isExpense() }.sumOf { it.amount }
    val totalIncome = billable.filter { it.isIncome() }.sumOf { it.amount }
    val transferCount = expenses.count { it.isTransfer() }
    val transferTotal = expenses.filter { it.isTransfer() }.sumOf { it.amount }
    val net = totalIncome - totalExpense

    FinanceSummaryCard(
        expenseTotal = totalExpense,
        incomeTotal = totalIncome,
        net = net,
        currencyCode = currencyCode,
        transferCount = transferCount,
        transferTotal = transferTotal,
        periodLabel = periodLabel,
        modifier = Modifier.padding(bottom = 8.dp)
    )
}

@Composable
fun DatePill(date: String, dayIncome: Double, dayExpense: Double, currencyCode: String = "EUR") {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 28.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = date,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onBackground
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (dayIncome > 0) {
                Text(
                    text = "+${CurrencyUtils.formatAmount(dayIncome, currencyCode)}",
                    style = MaterialTheme.typography.labelMedium.merge(AmountTextStyle),
                    color = IncomeGreen
                )
            }
            if (dayExpense > 0) {
                Text(
                    text = "−${CurrencyUtils.formatAmount(dayExpense, currencyCode)}",
                    style = MaterialTheme.typography.labelMedium.merge(AmountTextStyle),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
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
    time: String,
    currencyCode: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {},
    onDeleteRequest: () -> Unit,
    onReceiptClick: (() -> Unit)? = null
) {
    val rowBackground = MaterialTheme.colorScheme.surfaceVariant
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDeleteRequest()
                false
            } else {
                true
            }
        },
        positionalThreshold = { distance -> distance * 0.35f }
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RectangleShape),
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    Icons.Rounded.Delete,
                    contentDescription = stringResource(R.string.record_swipe_delete),
                    tint = MaterialTheme.colorScheme.onError,
                    modifier = Modifier.padding(end = 24.dp)
                )
            }
        }
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(rowBackground)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongClick
                )
        ) {
            TransactionRow(
                expense = expense,
                categoryName = categoryName,
                categoryColor = categoryColor,
                icon = icon,
                time = time,
                currencyCode = currencyCode,
                onReceiptClick = onReceiptClick
            )
        }
    }
}

@Composable
fun TransactionRow(
    expense: Expense,
    categoryName: String,
    categoryColor: Int? = null,
    icon: ImageVector,
    time: String? = null,
    currencyCode: String = "EUR",
    onReceiptClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val amountColor = when {
        expense.isIncome() -> IncomeGreen
        expense.isTransfer() -> TransferGray
        else -> MaterialTheme.colorScheme.onBackground
    }
    val fillColor = categoryColor?.let { colorIntToCompose(it) }

    Row(
        modifier = modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(fillColor ?: MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = categoryName,
                tint = fillColor?.let { iconTintOnCategoryFill(it) }
                    ?: MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = categoryName,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1
            )
            val subtitle = buildString {
                if (time != null) append(time)
                if (expense.note.isNotBlank()) {
                    if (isNotEmpty()) append(" · ")
                    append(expense.note)
                }
            }
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
        if (onReceiptClick != null) {
            IconButton(
                onClick = onReceiptClick,
                modifier = Modifier
                    .padding(end = 4.dp)
                    .size(48.dp)
            ) {
                Icon(
                    Icons.Rounded.AttachFile,
                    contentDescription = stringResource(R.string.record_view_receipt),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Text(
            text = when {
                expense.isIncome() -> "+${CurrencyUtils.formatAmount(expense.amount, currencyCode)}"
                expense.isTransfer() -> CurrencyUtils.formatAmount(expense.amount, currencyCode)
                else -> "-${CurrencyUtils.formatAmount(expense.amount, currencyCode)}"
            },
            style = MaterialTheme.typography.bodyLarge.merge(AmountTextStyle),
            color = amountColor
        )
    }
}
