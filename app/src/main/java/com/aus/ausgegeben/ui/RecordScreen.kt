package com.aus.ausgegeben.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.components.AppIcon
import com.aus.ausgegeben.ui.components.BudgetProgressBar
import com.aus.ausgegeben.ui.components.EmptyStateMessage
import com.aus.ausgegeben.ui.components.FinanceSummaryCard
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.IosSegmentedControl
import com.aus.ausgegeben.ui.components.IosSeparator
import com.aus.ausgegeben.ui.components.ReceiptImageDialog
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.MoneyText
import com.aus.ausgegeben.ui.components.MoneySize
import com.aus.ausgegeben.ui.components.recordListBottomPadding
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.ExpenseMuted
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.TransferGray
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.RecordListPeriod
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.displayTitle
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.localDayStartMillis
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun dateFormatsFor(currencyCode: String): Pair<SimpleDateFormat, SimpleDateFormat> {
    val locale = CurrencyUtils.localeFor(currencyCode)
    return SimpleDateFormat("HH:mm", locale) to SimpleDateFormat("dd.MM EEE", locale)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
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
    var searchExpanded by rememberSaveable { mutableStateOf(false) }
    val (timeFormat, dateFormat) = remember(currencyCode) { dateFormatsFor(currencyCode) }
    val monthLabel = remember { AnalyticsPeriod.THIS_MONTH.displayTitle() }
    val listPeriodLabel = when (uiState.listPeriod) {
        RecordListPeriod.THIS_MONTH -> monthLabel
        RecordListPeriod.ALL_TIME -> stringResource(R.string.record_period_all_time)
    }
    val monthSpent = remember(allMonthExpenses) {
        allMonthExpenses.filter { it.isExpense() }.sumOf { it.amount }
    }
    val insightLine = uiState.insights.topExpenseCategoryName
        ?.takeIf { uiState.insights.topExpenseCategoryAmount > 0 }
        ?.let { name ->
            stringResource(
                R.string.insight_top_category,
                name,
                CurrencyUtils.formatAmount(uiState.insights.topExpenseCategoryAmount, currencyCode)
            )
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

    if (uiState.searchQuery.isNotBlank()) {
        searchExpanded = true
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = recordListBottomPadding()
    ) {
        item(key = "title") {
            ScreenTitle(title = stringResource(R.string.screen_record))
        }

        item(key = "summary") {
            RecordHeader(
                expenses = uiState.headerExpenses,
                currencyCode = currencyCode,
                periodLabel = listPeriodLabel,
                insightLine = insightLine,
                compact = true
            )
        }

        uiState.monthlyBudget?.let { budget ->
            item(key = "budget") {
                BudgetProgressBar(
                    spent = monthSpent,
                    budget = budget,
                    currencyCode = currencyCode,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
        }

        stickyHeader(key = "toolbar") {
            RecordListToolbar(
                listPeriod = uiState.listPeriod,
                onListPeriod = viewModel::setListPeriod,
                searchQuery = uiState.searchQuery,
                onSearchChange = viewModel::setSearchQuery,
                searchExpanded = searchExpanded,
                onSearchExpandedChange = { searchExpanded = it },
                typeFilter = uiState.typeFilter,
                onTypeFilter = viewModel::setTypeFilter
            )
        }

        when {
            isListError -> {
                val error = lazyExpenses.loadState.refresh as LoadState.Error
                item(key = "error") {
                    EmptyStateMessage(
                        icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                        title = stringResource(R.string.record_error_title),
                        subtitle = error.error.localizedMessage
                            ?: stringResource(R.string.record_error_retry),
                        actionLabel = stringResource(R.string.record_error_retry),
                        onAction = { lazyExpenses.retry() },
                        modifier = Modifier.defaultMinSize(minHeight = 200.dp)
                    )
                }
            }
            isListLoading && isListEmpty -> {
                item(key = "loading") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
            isListEmpty && hasActiveFilter -> {
                item(key = "no-matches") {
                    EmptyStateMessage(
                        icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                        title = stringResource(R.string.record_no_matches_title),
                        subtitle = stringResource(R.string.record_no_matches_subtitle),
                        modifier = Modifier.defaultMinSize(minHeight = 200.dp)
                    )
                }
            }
            isListEmpty -> {
                item(key = "empty") {
                    EmptyRecordState(
                        modifier = Modifier.defaultMinSize(minHeight = 220.dp)
                    )
                }
            }
            else -> {
                groupedExpenses.forEach { (date, dayItems) ->
                    val billable = dayItems.filter { !it.isTransfer() }
                    val dayIncome = billable.filter { it.isIncome() }.sumOf { it.amount }
                    val dayExpense = billable.filter { it.isExpense() }.sumOf { it.amount }

                    item(key = "header-$date") {
                        DatePill(date, dayIncome, dayExpense, currencyCode)
                    }

                    item(key = "group-$date") {
                        GroupedSection(modifier = Modifier.padding(bottom = 8.dp)) {
                            Column(modifier = Modifier.clip(GroupedSectionClip)) {
                                dayItems
                                    .sortedByDescending { it.dateMillis }
                                    .forEachIndexed { index, expense ->
                                        androidx.compose.runtime.key(expense.id) {
                                            if (index > 0) IosSeparator(insetStart = 62.dp)
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
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
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
private fun RecordListToolbar(
    listPeriod: RecordListPeriod,
    onListPeriod: (RecordListPeriod) -> Unit,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    searchExpanded: Boolean,
    onSearchExpandedChange: (Boolean) -> Unit,
    typeFilter: TransactionTypeFilter,
    onTypeFilter: (TransactionTypeFilter) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColors.Background)
            .padding(bottom = AppSpacing.xs)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = AppSpacing.md, end = AppSpacing.xs, top = AppSpacing.xxs),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val periodOptions = RecordListPeriod.entries
            IosSegmentedControl(
                options = periodOptions.map { it.label() },
                selectedIndex = periodOptions.indexOf(listPeriod).coerceAtLeast(0),
                onSelected = { onListPeriod(periodOptions[it]) },
                modifier = Modifier.weight(1f)
            )
            IconButton(
                onClick = {
                    when {
                        searchQuery.isNotBlank() -> onSearchChange("")
                        searchExpanded -> onSearchExpandedChange(false)
                        else -> onSearchExpandedChange(true)
                    }
                }
            ) {
                AppIcon(
                    imageVector = if (searchExpanded) Icons.Rounded.Close else Icons.Rounded.Search,
                    contentDescription = stringResource(R.string.record_search),
                    tint = if (searchQuery.isNotBlank() || searchExpanded) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }
        }

        AnimatedVisibility(
            visible = searchExpanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            RecordSearchBar(
                query = searchQuery,
                onQueryChange = onSearchChange,
                modifier = Modifier.padding(top = AppSpacing.xxs)
            )
        }

        RecordTypeFilters(
            selected = typeFilter,
            onSelected = onTypeFilter,
            modifier = Modifier.padding(top = AppSpacing.xxs)
        )
    }
}

@Composable
private fun RecordSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        placeholder = {
            Text(
                stringResource(R.string.record_search_placeholder),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        leadingIcon = {
            Icon(
                Icons.Rounded.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.record_clear_search),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        textStyle = MaterialTheme.typography.bodyMedium,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.18f),
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
        )
    )
}

@Composable
private fun RecordTypeFilters(
    selected: TransactionTypeFilter,
    onSelected: (TransactionTypeFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    val options = TransactionTypeFilter.entries
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(options, key = { it.name }) { filter ->
            val isSelected = selected == filter
            val primary = MaterialTheme.colorScheme.primary
            FilterChip(
                selected = isSelected,
                onClick = { onSelected(filter) },
                label = {
                    Text(
                        filter.label(),
                        style = MaterialTheme.typography.labelMedium
                    )
                },
                shape = RoundedCornerShape(10.dp),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = isSelected,
                    borderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                    selectedBorderColor = primary.copy(alpha = 0.4f)
                ),
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    selectedContainerColor = primary.copy(alpha = 0.12f),
                    selectedLabelColor = primary
                )
            )
        }
    }
}

private val GroupedSectionClip = RoundedCornerShape(14.dp)

@Composable
private fun EmptyRecordState(
    modifier: Modifier = Modifier
) {
    EmptyStateMessage(
        icon = Icons.AutoMirrored.Rounded.ReceiptLong,
        title = stringResource(R.string.record_empty_title),
        subtitle = stringResource(R.string.record_empty_subtitle),
        modifier = modifier.fillMaxWidth()
    )
}

@Composable
fun RecordHeader(
    expenses: List<Expense>,
    currencyCode: String = "EUR",
    periodLabel: String = "all time",
    insightLine: String? = null,
    compact: Boolean = false
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
        insightLine = insightLine,
        compact = compact,
        modifier = Modifier.padding(bottom = 4.dp)
    )
}

@Composable
fun DatePill(date: String, dayIncome: Double, dayExpense: Double, currencyCode: String = "EUR") {
    val shape = RoundedCornerShape(AppRadius.card)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xxs)
            .clip(shape)
            .background(AppColors.CardSurface)
            .border(AppElevation.cardBorder, AppColors.CardBorder, shape)
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = date,
            style = MaterialTheme.typography.labelLarge,
            color = AppColors.OnBackground,
            fontWeight = FontWeight.SemiBold
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (dayIncome > 0) {
                MoneyText(
                    text = "+${CurrencyUtils.formatAmount(dayIncome, currencyCode)}",
                    size = MoneySize.Body,
                    color = IncomeGreen
                )
            }
            if (dayExpense > 0) {
                MoneyText(
                    text = "−${CurrencyUtils.formatAmount(dayExpense, currencyCode)}",
                    size = MoneySize.Body,
                    color = ExpenseMuted
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
    val rowBackground = AppColors.CardSurface
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
                    .background(ExpenseMuted),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    Icons.Rounded.Delete,
                    contentDescription = stringResource(R.string.record_swipe_delete),
                    tint = MaterialTheme.colorScheme.onError,
                    modifier = Modifier.padding(end = 20.dp)
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
        else -> AppColors.OnBackground
    }
    val fillColor = categoryColor?.let { colorIntToCompose(it) }
    val stripeColor = fillColor ?: when {
        expense.isIncome() -> IncomeGreen
        expense.isTransfer() -> TransferGray
        else -> MaterialTheme.colorScheme.primary
    }

    Row(
        modifier = modifier.padding(end = 14.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(40.dp)
                .clip(RoundedCornerShape(topEnd = 2.dp, bottomEnd = 2.dp))
                .background(stripeColor)
        )
        Spacer(modifier = Modifier.width(11.dp))
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(fillColor?.copy(alpha = 0.18f) ?: MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = categoryName,
                tint = fillColor ?: stripeColor,
                modifier = Modifier.size(18.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = categoryName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                fontWeight = FontWeight.Medium
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
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
        if (onReceiptClick != null) {
            IconButton(
                onClick = onReceiptClick,
                modifier = Modifier.size(36.dp)
            ) {
                Icon(
                    Icons.Rounded.AttachFile,
                    contentDescription = stringResource(R.string.record_view_receipt),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
        MoneyText(
            text = when {
                expense.isIncome() -> "+${CurrencyUtils.formatAmount(expense.amount, currencyCode)}"
                expense.isTransfer() -> CurrencyUtils.formatAmount(expense.amount, currencyCode)
                else -> "−${CurrencyUtils.formatAmount(expense.amount, currencyCode)}"
            },
            size = MoneySize.Title,
            color = amountColor
        )
    }
}
