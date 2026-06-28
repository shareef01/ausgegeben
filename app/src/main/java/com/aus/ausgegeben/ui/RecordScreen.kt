package com.aus.ausgegeben.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.*
import java.text.SimpleDateFormat
import java.util.Date

private object RecordAuroraTokens {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun surface() = MaterialTheme.colorScheme.surface

    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant

    @Composable
    fun hairline() = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)

    @Composable
    fun emerald() = Color(0xFF10B981)
    
    // Pillar 1: Ambient Aurora Background
    @Composable
    fun auroraBrush() = Brush.radialGradient(
        colors = listOf(emerald().copy(alpha = if (isAppDarkTheme()) 0.15f else 0.08f), Color.Transparent),
        radius = 1000f,
        center = Offset(x = 1000f, y = 0f) // Subtly in top corner
    )

    @Composable
    fun labelStyle() = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
        color = slate()
    )

    val TabularValueStyle = TextStyle(
        fontFeatureSettings = "tnum",
        fontWeight = FontWeight.SemiBold
    )
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
    
    // Performance: Memoize derived calculations to prevent UI jank during scroll
    val dayTotalsByLabel = remember(uiState.dayTotalsByLabel) { uiState.dayTotalsByLabel }
    val categories = remember(uiState.data.categories) { uiState.data.categories }
    val categoryById = remember(categories) { categories.associateBy { it.id } }
    
    var receiptToView by remember { mutableStateOf<String?>(null) }
    var expensePendingDelete by remember { mutableStateOf<Expense?>(null) }
    var searchExpanded by rememberSaveable { mutableStateOf(false) }

    val locale = CurrencyUtils.localeFor(currencyCode)
    val dateFormat = remember(locale) { SimpleDateFormat("dd MMM EEE", locale) }
    
    val allTimeLabel = stringResource(R.string.record_period_all_time)
    val listPeriodLabel = remember(uiState.toolbar.listPeriod, allTimeLabel) {
        when (uiState.toolbar.listPeriod) {
            RecordListPeriod.THIS_MONTH -> AnalyticsPeriod.THIS_MONTH.displayTitle()
            RecordListPeriod.ALL_TIME -> allTimeLabel
        }
    }

    // Pillar 1: Ambient Aurora Wrap
    Box(modifier = modifier.fillMaxSize().background(RecordAuroraTokens.background())) {
        Box(modifier = Modifier.fillMaxSize().background(RecordAuroraTokens.auroraBrush()))
        
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = recordListBottomPadding()
        ) {
            item(key = "hero") {
                val headerExpenses = uiState.data.headerExpenses
                val expenseTotal = remember(headerExpenses) { headerExpenses.filter { it.isExpense() }.sumOf { it.amount } }
                val incomeTotal = remember(headerExpenses) { headerExpenses.filter { it.isIncome() }.sumOf { it.amount } }
                val net = remember(headerExpenses) { 
                    headerExpenses.filter { !it.isTransfer() }.let { list ->
                        list.filter { it.isIncome() }.sumOf { it.amount } - list.filter { it.isExpense() }.sumOf { it.amount }
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

            stickyHeader(key = "toolbar") {
                RecordListToolbar(
                    listPeriod = uiState.toolbar.listPeriod,
                    onListPeriod = viewModel::setListPeriod,
                    searchQuery = uiState.toolbar.searchQuery,
                    onSearchChange = viewModel::setSearchQuery,
                    searchExpanded = searchExpanded,
                    onSearchExpandedChange = { searchExpanded = it }
                )
            }

            item { Spacer(Modifier.height(24.dp)) }

            if (lazyExpenses.loadState.refresh is LoadState.NotLoading && lazyExpenses.itemCount > 0) {
                uiState.insights.topExpenseCategoryName?.let { name ->
                    item(key = "insight") {
                        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text(
                                text = "MOST SPENT ON $name".uppercase(),
                                style = RecordAuroraTokens.labelStyle()
                            )
                        }
                    }
                }
            }

            when (val state = lazyExpenses.loadState.refresh) {
                is LoadState.Error -> {
                    item(key = "error") {
                        EmptyStateMessage(
                            icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                            title = stringResource(R.string.record_error_title),
                            subtitle = state.error.localizedMessage ?: "",
                            actionLabel = stringResource(R.string.record_error_retry),
                            onAction = { lazyExpenses.retry() },
                        )
                    }
                }
                is LoadState.Loading -> {
                    if (lazyExpenses.itemCount == 0) {
                        item(key = "loading") {
                            Box(Modifier.fillMaxWidth().padding(64.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary, strokeWidth = 2.dp)
                            }
                        }
                    }
                }
                else -> {
                    if (lazyExpenses.itemCount == 0) {
                        item(key = "empty") {
                            EmptyStateMessage(
                                icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                                title = stringResource(R.string.record_empty_title),
                                subtitle = stringResource(R.string.record_empty_subtitle),
                                actionLabel = stringResource(R.string.record_empty_action),
                                onAction = onAddTransaction
                            )
                        }
                    } else {
                        items(
                            count = lazyExpenses.itemCount,
                            key = lazyExpenses.itemKey { it.id }
                        ) { index ->
                            val expense = lazyExpenses[index] ?: return@items
                            val dayStart = localDayStartMillis(expense.dateMillis)
                            val isFirstInDay = if (index > 0) {
                                val prev = lazyExpenses.peek(index - 1)
                                prev == null || localDayStartMillis(prev.dateMillis) != dayStart
                            } else true

                            if (isFirstInDay) {
                                val dateLabel = dateFormat.format(Date(dayStart))
                                DateSectionHeader(dateLabel, dayTotalsByLabel[dateLabel] ?: (0.0 to 0.0), currencyCode)
                            }

                            val category = categoryById[expense.categoryId]
                            SwipeableTransactionRow(
                                expense = expense,
                                categoryName = category?.name ?: stringResource(R.string.record_unknown_category),
                                categoryColor = category?.colorInt,
                                icon = iconForCategory(category?.iconName, category?.name),
                                currencyCode = currencyCode,
                                onClick = { onExpenseClick(expense) },
                                onLongClick = {
                                    viewModel.duplicateExpense(expense)
                                    onExpenseDuplicated()
                                },
                                onDeleteRequest = { expensePendingDelete = expense },
                                onReceiptClick = expense.receiptImagePath?.let { path -> { receiptToView = path } },
                            )
                            
                            HorizontalDivider(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                                thickness = 0.5.dp,
                                color = RecordAuroraTokens.hairline()
                            )
                        }
                    }
                }
            }
        }
    }

    if (receiptToView != null) {
        ReceiptImageDialog(uri = receiptToView!!, onDismiss = { receiptToView = null })
    }

    if (expensePendingDelete != null) {
        AlertDialog(
            onDismissRequest = { expensePendingDelete = null },
            containerColor = RecordAuroraTokens.surface(),
            title = { Text(stringResource(R.string.record_delete_title), color = MaterialTheme.colorScheme.onSurface) },
            text = { Text(stringResource(R.string.record_delete_message), color = RecordAuroraTokens.slate()) },
            confirmButton = {
                TextButton(onClick = {
                    expensePendingDelete?.let { viewModel.deleteExpense(it); onExpenseDeleted(it) }
                    expensePendingDelete = null
                }) {
                    Text(stringResource(R.string.record_delete_confirm), color = Color(0xFFFB7185))
                }
            },
            dismissButton = {
                TextButton(onClick = { expensePendingDelete = null }) {
                    Text(stringResource(R.string.record_delete_cancel), color = MaterialTheme.colorScheme.onSurface)
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
) {
    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .height(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(RecordAuroraTokens.surface())
                    .padding(4.dp)
            ) {
                val thisMonthLabel = stringResource(R.string.add_type_expense)
                val allTimeLabel = stringResource(R.string.record_period_all_time)
                
                listOf(RecordListPeriod.THIS_MONTH, RecordListPeriod.ALL_TIME).forEach { period ->
                    val isSelected = listPeriod == period
                    val label = if (period == RecordListPeriod.THIS_MONTH) thisMonthLabel else allTimeLabel
                    
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) RecordAuroraTokens.background() else Color.Transparent)
                            .clickable { onListPeriod(period) },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label.uppercase(),
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            style = TextStyle(
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                letterSpacing = 1.sp,
                                color = if (isSelected) MaterialTheme.colorScheme.onSurface else RecordAuroraTokens.slate()
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            IconButton(
                onClick = { onSearchExpandedChange(!searchExpanded) },
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(RecordAuroraTokens.surface())
            ) {
                Icon(
                    imageVector = if (searchExpanded) Icons.Rounded.Close else Icons.Rounded.Search,
                    contentDescription = null,
                    tint = if (searchQuery.isNotBlank()) MaterialTheme.colorScheme.primary else RecordAuroraTokens.slate(),
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        AnimatedVisibility(visible = searchExpanded, enter = expandVertically(), exit = shrinkVertically()) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text(stringResource(R.string.record_search_placeholder), color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)) },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
                    unfocusedBorderColor = RecordAuroraTokens.hairline(),
                    focusedContainerColor = RecordAuroraTokens.surface(),
                    unfocusedContainerColor = RecordAuroraTokens.surface(),
                    cursorColor = MaterialTheme.colorScheme.primary,
                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                ),
                singleLine = true
            )
        }
    }
}

@Composable
private fun DateSectionHeader(
    date: String,
    dayTotals: Pair<Double, Double>,
    currencyCode: String
) {
    // Law 4: Header Alignment sharing same horizontal padding as rows
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = date.uppercase(), 
            style = RecordAuroraTokens.labelStyle(),
            modifier = Modifier.weight(1f) 
        )
        
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val (dayIncome, dayExpense) = dayTotals
            if (dayIncome > 0) {
                Text(
                    text = "+" + CurrencyUtils.formatAmount(dayIncome, currencyCode),
                    style = TextStyle(
                        fontSize = 11.sp, 
                        fontWeight = FontWeight.Bold, 
                        fontFeatureSettings = "tnum", 
                        color = Color(0xFF10B981), 
                        textAlign = TextAlign.End
                    )
                )
            }
            if (dayExpense > 0) {
                Text(
                    text = "-" + CurrencyUtils.formatAmount(dayExpense, currencyCode),
                    style = TextStyle(
                        fontSize = 11.sp, 
                        fontWeight = FontWeight.Bold, 
                        fontFeatureSettings = "tnum", 
                        color = Color(0xFFFB7185), 
                        textAlign = TextAlign.End
                    )
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
    currencyCode: String,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onDeleteRequest: () -> Unit,
    onReceiptClick: (() -> Unit)?
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { if (it == SwipeToDismissBoxValue.EndToStart) { onDeleteRequest(); false } else true }
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            // Pillar 1: The Background Layer (The Red Zone)
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0xFFEF4444))
                    .padding(horizontal = 24.dp),
                contentAlignment = Alignment.CenterEnd) {
                Icon(
                    imageVector = Icons.Rounded.Delete,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    ) {
        // Pillar 2: The Foreground Layer (The Data)
        // Theme-aware background
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(RecordAuroraTokens.background())
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongClick
                )
        ) {
            TransactionRow(expense, categoryName, categoryColor, icon, currencyCode, onReceiptClick)
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
    onReceiptClick: (() -> Unit)?,
) {
    val isIncome = expense.isIncome()
    val isTransfer = expense.isTransfer()
    
    val amountColor = when {
        isIncome -> Color(0xFF10B981)
        isTransfer -> Color(0xFF94A3B8)
        else -> MaterialTheme.colorScheme.onSurface
    }
    
    val indicatorColor = categoryColor?.let { colorIntToCompose(it) } ?: MaterialTheme.colorScheme.onSurface

    // Law 2: Ironclad Transaction Row Alignments
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // [Icon Box with Directional Overlay]
        Box(contentAlignment = Alignment.BottomEnd) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(indicatorColor.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = indicatorColor,
                    modifier = Modifier.size(16.dp)
                )
            }
            
            if (!isTransfer) {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.background)
                        .padding(1.dp)
                        .clip(CircleShape)
                        .background(if (isIncome) Color(0xFF10B981) else Color(0xFFFB7185)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isIncome) Icons.Rounded.ArrowUpward else Icons.Rounded.ArrowDownward,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(8.dp)
                    )
                }
            }
        }
        
        // [Spacer(12.dp)]
        Spacer(modifier = Modifier.width(12.dp))
        
        // [Column containing Category/Note] - CRITICAL: Modifier.weight(1f)
        Column(modifier = Modifier.weight(1f)) {
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
        
        if (onReceiptClick != null) {
            Icon(
                imageVector = Icons.Rounded.AttachFile, 
                contentDescription = null, 
                tint = RecordAuroraTokens.slate(), 
                modifier = Modifier
                    .size(14.dp)
                    .padding(end = 8.dp)
                    .clickable { onReceiptClick() }
            )
        }
        
        // [Amount Text] - fontFeatureSettings = "tnum"
        Text(
            text = when {
                isIncome -> "+" + CurrencyUtils.formatAmount(expense.amount, currencyCode)
                isTransfer -> CurrencyUtils.formatAmount(expense.amount, currencyCode)
                else -> "-" + CurrencyUtils.formatAmount(expense.amount, currencyCode)
            },
            style = TextStyle(
                fontSize = 15.sp, 
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum",
                color = amountColor,
                textAlign = TextAlign.End
            )
        )
    }
}
