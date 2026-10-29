package com.aus.ausgegeben.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.core.Animatable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.*
import kotlin.math.abs

private object BillsAuroraTokens {
    @Composable
    fun slate() = readableSecondaryColor()

    @Composable
    fun labelStyle() = sectionLabelStyle()
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun BillsScreen(
    viewModel: InsightsViewModel,
    currencyCode: String = "EUR",
    dataError: String? = null,
    onRetryDataError: () -> Unit = {},
    onAddTransaction: () -> Unit = {},
    onManageBudgets: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isWide = isWideScreen()
    val hasAnalytics = remember(uiState.expensesByCategory, uiState.incomeByCategory, uiState.transfersByCategory) {
        uiState.expensesByCategory.isNotEmpty() ||
        uiState.incomeByCategory.isNotEmpty() ||
        uiState.transfersByCategory.isNotEmpty()
    }

    val periodOptions = remember { analyticsPeriodOptions(monthsBack = 14) }
    val expenseTotal = uiState.totalExpenses
    val incomeTotal = uiState.totalIncome
    val selectedPeriodLabel = remember(uiState.periodKey, uiState.periodLabel, periodOptions) {
        if (uiState.periodKey == "all_time") {
            null
        } else {
            uiState.periodLabel.ifBlank { periodOptions.getOrNull(1)?.label ?: periodOptions.first().label }
        }
    }
    val finalPeriodLabel = selectedPeriodLabel ?: stringResource(R.string.period_all_time)

    // Motion: Track period changes to trigger island stagger
    val entranceKey = remember(uiState.periodKey) { Any() }

    // Pillar 1: Ambient Aurora Canvas
    Box(modifier = modifier.fillMaxSize().background(AppAurora.background())) {
        Box(modifier = Modifier.fillMaxSize().background(AppAurora.brush()))

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
                contentPadding = tabScreenListBottomPadding()
            ) {
                item(key = "title") {
                    ScreenTitle(
                        title = stringResource(R.string.screen_bills),
                        action = if (isWide && hasAnalytics) {
                            {
                                AppButton(
                                    onClick = onAddTransaction,
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
                                ) {
                                    Text(stringResource(R.string.nav_add_transaction))
                                }
                            }
                        } else null,
                    )
                }

                stickyHeader(key = "period") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(AppAurora.background())
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
                                .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
                                .padding(vertical = 4.dp),
                        ) {
                            AnalyticsPeriodPicker(
                                options = periodOptions,
                                selectedKey = uiState.periodKey,
                                selectedLabel = finalPeriodLabel,
                                onSelected = { viewModel.setPeriodKey(it.storageKey) },
                            )
                        }
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = appDividerColor(),
                        )
                    }
                }

                item(key = "category_budgets") {
                    val current = AnalyticsPeriod.THIS_MONTH.dateRangeMillis()
                    if (analyticsDateRangeMillis(uiState.periodKey) == current) CategoryBudgetProgressSection(uiState.categoryBudgetProgress, uiState.budgetIncomplete, currencyCode, onManageBudgets)
                }
                if (uiState.isLoading) {
                    item(key = "loading") {
                        AppLoadingState()
                    }
                } else if (dataError != null && !hasAnalytics) {
                    item(key = "error") {
                        EmptyStateMessage(
                            icon = Icons.Rounded.CloudOff,
                            title = stringResource(R.string.record_error_title),
                            subtitle = stringResource(R.string.snackbar_data_listener_error),
                            actionLabel = stringResource(R.string.record_error_retry),
                            onAction = onRetryDataError,
                        )
                    }
                } else if (!hasAnalytics) {
                    item(key = "empty") {
                        EmptyStateMessage(
                            icon = Icons.Rounded.Analytics,
                            title = stringResource(R.string.bills_empty_title),
                            subtitle = stringResource(R.string.bills_empty_subtitle),
                            actionLabel = stringResource(R.string.nav_add_transaction),
                            onAction = onAddTransaction,
                        )
                    }
                } else {
                    if (uiState.dataTruncated) {
                        item(key = "truncated") {
                            DataTruncatedBanner(
                                modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
                            )
                        }
                    }
                    if (expenseTotal > 0 || incomeTotal > 0) {
                        item(key = "overview") {
                            val reduceMotion = rememberReduceMotion()
                            val revealAlpha = remember(entranceKey) { Animatable(if (reduceMotion) 1f else 0f) }
                            LaunchedEffect(entranceKey, reduceMotion) {
                                if (reduceMotion) {
                                    revealAlpha.snapTo(1f)
                                    return@LaunchedEffect
                                }
                                revealAlpha.animateTo(1f, tween(420, delayMillis = 40))
                            }
                            Box(
                                modifier = Modifier
                                    .graphicsLayer { alpha = revealAlpha.value }
                            ) {
                                if (isWide) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                                    ) {
                                        Box(modifier = Modifier.weight(1.3f)) {
                                            IncomeExpenseOverviewChart(
                                                expenseTotal = expenseTotal,
                                                incomeTotal = incomeTotal,
                                                currencyCode = currencyCode
                                            )
                                        }
                                        Box(modifier = Modifier.weight(1f).padding(top = 24.dp)) {
                                            InsightsStatGrid(
                                                income = incomeTotal,
                                                expense = expenseTotal,
                                                currencyCode = currencyCode
                                            )
                                        }
                                    }
                                } else {
                                    Column {
                                        IncomeExpenseOverviewChart(
                                            expenseTotal = expenseTotal,
                                            incomeTotal = incomeTotal,
                                            currencyCode = currencyCode
                                        )
                                        InsightsStatGrid(
                                            income = incomeTotal,
                                            expense = expenseTotal,
                                            currencyCode = currencyCode,
                                            modifier = Modifier.padding(bottom = 8.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (uiState.pace != null || uiState.comparison != null) {
                        item(key = "smart-metrics") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
                                revealAlpha.animateTo(1f, tween(420, delayMillis = 60))
                            }
                            Box(
                                modifier = Modifier
                                    .graphicsLayer { alpha = revealAlpha.value }
                                    .fillMaxWidth()
                                    .padding(horizontal = AppSpacing.md, vertical = 6.dp)
                            ) {
                                if (isWide && uiState.pace != null && uiState.comparison != null) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                                    ) {
                                        Box(modifier = Modifier.weight(1f)) {
                                            SpendingPaceCard(
                                                pace = uiState.pace!!,
                                                currencyCode = currencyCode
                                            )
                                        }
                                        Box(modifier = Modifier.weight(1f)) {
                                            PeriodComparisonCard(
                                                comparison = uiState.comparison!!,
                                                currencyCode = currencyCode
                                            )
                                        }
                                    }
                                } else {
                                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                        uiState.pace?.let {
                                            SpendingPaceCard(pace = it, currencyCode = currencyCode)
                                        }
                                        uiState.comparison?.let {
                                            PeriodComparisonCard(comparison = it, currencyCode = currencyCode)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (uiState.allTimeAverages != null) {
                        item(key = "all-time-averages") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
                                revealAlpha.animateTo(1f, tween(420, delayMillis = 60))
                            }
                            Box(
                                modifier = Modifier
                                    .graphicsLayer { alpha = revealAlpha.value }
                                    .fillMaxWidth()
                                    .padding(horizontal = AppSpacing.md, vertical = 6.dp)
                            ) {
                                AllTimeAveragesCard(
                                    averages = uiState.allTimeAverages!!,
                                    currencyCode = currencyCode
                                )
                            }
                        }
                    }

                    if (uiState.categoryMovers.isNotEmpty()) {
                        item(key = "category-movers") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
                                revealAlpha.animateTo(1f, tween(420, delayMillis = 80))
                            }
                            Box(
                                modifier = Modifier
                                    .graphicsLayer { alpha = revealAlpha.value }
                                    .fillMaxWidth()
                                    .padding(horizontal = AppSpacing.md, vertical = 6.dp)
                            ) {
                                CategoryMoversCard(
                                    movers = uiState.categoryMovers,
                                    currencyCode = currencyCode
                                )
                            }
                        }
                    }

                    if (isWide) {
                        item(key = "islands-grid") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
                                revealAlpha.animateTo(1f, tween(420, delayMillis = 100))
                            }
                            Box(modifier = Modifier.graphicsLayer { alpha = revealAlpha.value }) {
                                FlowRow(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    maxItemsInEachRow = 2
                                ) {
                                if (uiState.expensesByCategory.isNotEmpty()) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        CategoryAnalyticsIsland(
                                            title = stringResource(R.string.bills_section_expenses),
                                            data = uiState.expensesByCategory,
                                            currencyCode = currencyCode,
                                            kind = AnalyticsKind.Expense,
                                        )
                                    }
                                }
                                if (uiState.incomeByCategory.isNotEmpty()) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        CategoryAnalyticsIsland(
                                            title = stringResource(R.string.bills_section_income),
                                            data = uiState.incomeByCategory,
                                            currencyCode = currencyCode,
                                            kind = AnalyticsKind.Income,
                                        )
                                    }
                                }
                                if (uiState.transfersByCategory.isNotEmpty()) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        CategoryAnalyticsIsland(
                                            title = stringResource(R.string.bills_section_transfers),
                                            data = uiState.transfersByCategory,
                                            currencyCode = currencyCode,
                                            kind = AnalyticsKind.Transfer,
                                        )
                                    }
                                }
                                }
                            }
                        }
                    } else {
                        if (uiState.expensesByCategory.isNotEmpty()) {
                            item(key = "expenses-card") {
                                val revealAlpha = remember(entranceKey) { Animatable(0f) }
                                LaunchedEffect(entranceKey) {
                                    revealAlpha.animateTo(1f, tween(500, delayMillis = 100))
                                }
                                Box(modifier = Modifier.graphicsLayer { alpha = revealAlpha.value }) {
                                    CategoryAnalyticsIsland(
                                        title = stringResource(R.string.bills_section_expenses),
                                        data = uiState.expensesByCategory,
                                        currencyCode = currencyCode,
                                        kind = AnalyticsKind.Expense,
                                    )
                                }
                            }
                        }

                        if (uiState.incomeByCategory.isNotEmpty()) {
                            item(key = "income-card") {
                                val revealAlpha = remember(entranceKey) { Animatable(0f) }
                                LaunchedEffect(entranceKey) {
                                    revealAlpha.animateTo(1f, tween(500, delayMillis = 250))
                                }
                                Box(modifier = Modifier.graphicsLayer { alpha = revealAlpha.value }) {
                                    CategoryAnalyticsIsland(
                                        title = stringResource(R.string.bills_section_income),
                                        data = uiState.incomeByCategory,
                                        currencyCode = currencyCode,
                                        kind = AnalyticsKind.Income,
                                    )
                                }
                            }
                        }

                        if (uiState.transfersByCategory.isNotEmpty()) {
                            item(key = "transfers-card") {
                                val revealAlpha = remember(entranceKey) { Animatable(0f) }
                                LaunchedEffect(entranceKey) {
                                    revealAlpha.animateTo(1f, tween(500, delayMillis = 350))
                                }
                                Box(modifier = Modifier.graphicsLayer { alpha = revealAlpha.value }) {
                                    CategoryAnalyticsIsland(
                                        title = stringResource(R.string.bills_section_transfers),
                                        data = uiState.transfersByCategory,
                                        currencyCode = currencyCode,
                                        kind = AnalyticsKind.Transfer,
                                    )
                                }
                            }
                        }
                    }

                    if (uiState.cashFlowTrend.isNotEmpty()) {
                        item(key = "cash-flow") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
                                revealAlpha.animateTo(1f, tween(500, delayMillis = 550))
                            }
                            Box(
                                modifier = Modifier
                                    .graphicsLayer { alpha = revealAlpha.value }
                                    .then(if (isWide) Modifier.fillMaxWidth(0.85f) else Modifier),
                                contentAlignment = Alignment.Center
                            ) {
                                CashFlowCard(
                                    trend = uiState.cashFlowTrend,
                                    currencyCode = currencyCode,
                                    periodKey = uiState.periodKey
                                )
                            }
                        }
                    }

                    item(key = "footer") { Spacer(Modifier.height(AppSpacing.xxxl)) }
                }
            }
        }
    }
}

@Composable
private fun InsightsStatGrid(
    income: Double,
    expense: Double,
    currencyCode: String,
    modifier: Modifier = Modifier
) {
    val net = income - expense
    StatCardRow(
        stats = listOf(
            StatValue(stringResource(R.string.summary_spent), CurrencyUtils.formatAmount(expense, currencyCode), financeExpenseTextColor()),
            StatValue(
                stringResource(R.string.chart_net_label),
                CurrencyUtils.formatAmount(net, currencyCode),
                if (net >= 0) financeIncomeTextColor() else financeExpenseTextColor(),
            ),
            StatValue(stringResource(R.string.summary_earned), CurrencyUtils.formatAmount(income, currencyCode), financeIncomeTextColor()),
        ),
        spacing = AppSpacing.sm,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md),
    )
}

private data class StatValue(val label: String, val value: String, val color: Color)

private val StatValueStyle = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum")
private val StatValueMinSize = 11.sp
private val StatCardHorizontalPadding = 6.dp

/**
 * Three cards side by side when every amount fits its third at a readable size, otherwise
 * one full-width card per value. "1.104.064,70" cannot fit a third of a 320dp phone, and
 * the cards used to shrink it to 9.5sp and then ellipsise it (web parity: the averages
 * row stacks on narrow screens).
 */
@Composable
private fun StatCardRow(
    stats: List<StatValue>,
    spacing: Dp,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    BoxWithConstraints(modifier) {
        val columnWidthPx = with(density) {
            ((maxWidth - spacing * (stats.size - 1)) / stats.size - StatCardHorizontalPadding * 2).roundToPx()
        }
        val fitsSideBySide = remember(stats, columnWidthPx, density) {
            val minStyle = StatValueStyle.copy(fontSize = StatValueMinSize)
            stats.all { measurer.measure(it.value, minStyle, softWrap = false, maxLines = 1).size.width <= columnWidthPx }
        }
        if (fitsSideBySide) {
            Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                stats.forEach { StatCard(it, Modifier.weight(1f)) }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.xs)) {
                stats.forEach { StackedStatCard(it) }
            }
        }
    }
}

@Composable
private fun StatCard(
    stat: StatValue,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .appGlassCard(RoundedCornerShape(AppRadius.md))
            .padding(vertical = 12.dp, horizontal = StatCardHorizontalPadding),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            AutoScalingText(
                text = stat.label.uppercase(),
                style = BillsAuroraTokens.labelStyle().copy(
                    fontSize = 11.sp,
                    letterSpacing = 0.5.sp
                ),
                minFontSize = 8.sp,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(4.dp))
            AutoScalingText(
                text = stat.value,
                style = StatValueStyle.copy(color = stat.color),
                minFontSize = StatValueMinSize,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun StackedStatCard(stat: StatValue) {
    // Label above the amount, so the amount gets the card's full width.
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .appGlassCard(RoundedCornerShape(AppRadius.md))
            .padding(vertical = 10.dp, horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = stat.label.uppercase(),
            style = BillsAuroraTokens.labelStyle().copy(fontSize = 11.sp, letterSpacing = 0.5.sp),
        )
        AutoScalingText(
            text = stat.value,
            style = StatValueStyle.copy(fontSize = 15.sp, color = stat.color),
            minFontSize = StatValueMinSize,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CashFlowCard(
    trend: List<CashFlowPoint>,
    currencyCode: String,
    periodKey: String,
) {
    val totalIncome = trend.sumOf { it.income }
    val totalExpense = trend.sumOf { it.expense }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .appGlassCard()
            .padding(horizontal = 20.dp, vertical = 24.dp)
    ) {
        Column {
            // The legend wraps under the title when the totals line leaves it no room.
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.padding(end = AppSpacing.sm)) {
                    Text(
                        text = stringResource(R.string.chart_cash_flow_title).uppercase(),
                        style = BillsAuroraTokens.labelStyle(),
                    )
                    Text(
                        text = stringResource(
                            R.string.chart_cash_flow_subtitle,
                            CurrencyUtils.formatAmount(totalIncome, currencyCode),
                            CurrencyUtils.formatAmount(totalExpense, currencyCode)
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = readableSecondaryColor(),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                CashFlowLegend()
            }

            Spacer(Modifier.height(24.dp))

            CashFlowChart(trend = trend, periodKey = periodKey)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = trend.firstOrNull()?.label ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = readableSecondaryColor()
                )
                if (trend.size >= 3) {
                    val midPoint = trend[trend.size / 2]
                    Text(
                        text = midPoint.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = readableSecondaryColor()
                    )
                }
                Text(
                    text = trend.lastOrNull()?.label ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = readableSecondaryColor()
                )
            }
        }
    }
}

private enum class AnalyticsKind { Expense, Income, Transfer }

@Composable
private fun CategoryAnalyticsIsland(
    title: String,
    data: Map<Category, Double>,
    currencyCode: String,
    kind: AnalyticsKind = AnalyticsKind.Expense,
) {
    val total = data.values.sum()
    val sorted = remember(data) { data.toList().sortedByDescending { it.second } }
    val chartColors = remember(sorted) {
        harmonizedChartColors(sorted.map { (category, _) -> category.name to category.colorInt })
    }
    val chartData = remember(sorted) { sorted.associate { (category, amount) -> category.name to amount } }

    val accentColor = when (kind) {
        AnalyticsKind.Income -> financeIncomeTextColor()
        AnalyticsKind.Transfer -> financeTransferColor()
        AnalyticsKind.Expense -> financeExpenseTextColor()
    }
    val totalLabelRes = when (kind) {
        AnalyticsKind.Income -> R.string.bills_total_income
        AnalyticsKind.Transfer -> R.string.bills_total_transfers
        AnalyticsKind.Expense -> R.string.bills_total_expense
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .appGlassCard()
            .padding(horizontal = 20.dp, vertical = 24.dp)
    ) {
        Column {
            Text(
                text = title.uppercase(),
                style = BillsAuroraTokens.labelStyle().copy(color = accentColor),
                modifier = Modifier.padding(bottom = 4.dp),
            )
            
            Spacer(Modifier.height(32.dp))

            DonutChart(
                data = chartData,
                colors = chartColors,
                centerLabel = CurrencyUtils.formatAmount(total, currencyCode, showSymbol = false),
                centerSubLabel = stringResource(totalLabelRes).uppercase(),
                chartSize = 180.dp,
                currencyCode = currencyCode,
            )

            Spacer(Modifier.height(32.dp))

            Column {
                sorted.forEachIndexed { index, (category, amount) ->
                    val color = chartColors[category.name] ?: MaterialTheme.colorScheme.onSurface
                    CategoryMetricRow(
                        category = category,
                        amount = amount,
                        color = color,
                        currencyCode = currencyCode,
                        total = total,
                    )
                    if (index < sorted.lastIndex) {
                        IosSeparator()
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryMetricRow(
    category: Category,
    amount: Double,
    color: Color,
    currencyCode: String,
    total: Double,
) {
    val percent = if (total > 0) ((amount / total) * 100).toInt() else 0
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .appGlassCard(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(color),
            )
        }
        Spacer(Modifier.width(12.dp))
        // The amount drops under the name when both do not fit: beside a seven-digit amount
        // at large text, the name column was a few letters wide ("100%" split in two).
        NameAmountLayout(
            modifier = Modifier.weight(1f),
            name = {
                Column {
                    Text(
                        text = category.name,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "$percent%",
                        style = MaterialTheme.typography.labelSmall,
                        color = BillsAuroraTokens.slate(),
                    )
                }
            },
            amount = {
                Text(
                    text = CurrencyUtils.formatAmount(amount, currencyCode),
                    style = TextStyle(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFeatureSettings = "tnum",
                        color = MaterialTheme.colorScheme.onSurface,
                    ),
                )
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpendingPaceCard(
    pace: SpendingPace,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    val pct = (pace.daysElapsed.toFloat() / pace.daysInMonth.toFloat()).coerceIn(0f, 1f)
    val overBudget = pace.projectedOverBudget
    val isCompleted = pace.daysElapsed >= pace.daysInMonth

    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard()
            .padding(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            // FlowRow: the badge moves under the title when both do not fit. In a Row the badge
            // ("Voraussichtlich 5.999,75 über Budget") was squeezed to one letter per line.
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.insights_pace_title).uppercase(),
                    style = BillsAuroraTokens.labelStyle(),
                    modifier = Modifier.padding(end = AppSpacing.xs),
                )
                if (isCompleted) {
                    InsightsBadge(
                        text = stringResource(R.string.insights_month_completed),
                        backgroundColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (overBudget != null && overBudget > 0) {
                    InsightsBadge(
                        text = stringResource(
                            R.string.insights_projected_over_budget,
                            CurrencyUtils.formatAmount(overBudget, currencyCode)
                        ),
                        backgroundColor = financeExpenseColor().copy(alpha = 0.15f),
                        contentColor = financeExpenseTextColor(),
                    )
                } else if (pace.budget != null) {
                    InsightsBadge(
                        text = stringResource(R.string.insights_on_track_budget),
                        backgroundColor = financeIncomeColor().copy(alpha = 0.15f),
                        contentColor = financeIncomeTextColor(),
                    )
                } else {
                    InsightsBadge(
                        text = stringResource(
                            R.string.insights_days_elapsed,
                            pace.daysElapsed,
                            pace.daysInMonth
                        ),
                        backgroundColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.insights_daily_average),
                        style = MaterialTheme.typography.bodySmall,
                        color = BillsAuroraTokens.slate(),
                    )
                    Spacer(Modifier.height(2.dp))
                    AutoScalingText(
                        text = CurrencyUtils.formatAmount(pace.dailyAverage, currencyCode),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontFeatureSettings = "tnum",
                            color = MaterialTheme.colorScheme.onSurface,
                        ),
                        minFontSize = 11.sp,
                        textAlign = TextAlign.Start,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.insights_projected_total),
                        style = MaterialTheme.typography.bodySmall,
                        color = BillsAuroraTokens.slate(),
                    )
                    Spacer(Modifier.height(2.dp))
                    AutoScalingText(
                        text = CurrencyUtils.formatAmount(pace.projectedTotal, currencyCode),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontFeatureSettings = "tnum",
                            color = MaterialTheme.colorScheme.primary,
                        ),
                        minFontSize = 11.sp,
                        textAlign = TextAlign.Start,
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(pct)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(3.dp))
                        .background(MaterialTheme.colorScheme.primary)
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PeriodComparisonCard(
    comparison: PeriodComparison,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard()
            .padding(16.dp)
    ) {
        if (!comparison.hasPriorData) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    itemVerticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.insights_comparison_title).uppercase(),
                        style = BillsAuroraTokens.labelStyle(),
                        modifier = Modifier.padding(end = AppSpacing.xs),
                    )
                    InsightsBadge(
                        text = stringResource(R.string.insights_no_prior_period),
                        backgroundColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = stringResource(R.string.bills_empty_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = BillsAuroraTokens.slate(),
                )
            }
        } else {
            val expDelta = comparison.expenseDelta
            val isExpLess = expDelta < 0
            val isExpMore = expDelta > 0
            val expColor = if (isExpLess) financeIncomeTextColor() else if (isExpMore) financeExpenseTextColor() else MaterialTheme.colorScheme.onSurface
            val expSign = if (isExpMore) "+" else if (isExpLess) "-" else ""
            val expPctStr = if (comparison.expensePercentageDelta != null) {
                " (${if (comparison.expensePercentageDelta > 0) "+" else ""}${comparison.expensePercentageDelta}%)"
            } else ""

            val netDelta = comparison.netDelta
            val netColor = if (netDelta >= 0) financeIncomeTextColor() else financeExpenseTextColor()

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    itemVerticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.insights_comparison_title).uppercase(),
                        style = BillsAuroraTokens.labelStyle(),
                        modifier = Modifier.padding(end = AppSpacing.xs),
                    )
                    InsightsBadge(
                        text = (if (isExpLess) stringResource(R.string.insights_favorable_less)
                        else if (isExpMore) stringResource(R.string.insights_unfavorable_more)
                        else stringResource(R.string.chart_total_label)) + expPctStr,
                        backgroundColor = expColor.copy(alpha = 0.15f),
                        contentColor = expColor,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.summary_spent),
                            style = MaterialTheme.typography.bodySmall,
                            color = BillsAuroraTokens.slate(),
                        )
                        Spacer(Modifier.height(2.dp))
                        AutoScalingText(
                            text = "$expSign${CurrencyUtils.formatAmount(abs(expDelta), currencyCode)}",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontFeatureSettings = "tnum",
                                color = expColor,
                            ),
                            minFontSize = 11.sp,
                            textAlign = TextAlign.Start,
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.chart_net_label),
                            style = MaterialTheme.typography.bodySmall,
                            color = BillsAuroraTokens.slate(),
                        )
                        Spacer(Modifier.height(2.dp))
                        AutoScalingText(
                            text = "${if (netDelta >= 0) "+" else "-"}${CurrencyUtils.formatAmount(abs(netDelta), currencyCode)}",
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontFeatureSettings = "tnum",
                                color = netColor,
                            ),
                            minFontSize = 11.sp,
                            textAlign = TextAlign.Start,
                        )
                    }
                }

                Text(
                    text = if (netDelta >= 0) {
                        stringResource(R.string.insights_net_improved, CurrencyUtils.formatAmount(abs(netDelta), currencyCode))
                    } else {
                        stringResource(R.string.insights_net_declined, CurrencyUtils.formatAmount(abs(netDelta), currencyCode))
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = BillsAuroraTokens.slate(),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryMoversCard(
    movers: List<CategoryMover>,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    if (movers.isEmpty()) return

    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard()
            .padding(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text(
                    text = stringResource(R.string.insights_movers_title).uppercase(),
                    style = BillsAuroraTokens.labelStyle(),
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = stringResource(R.string.insights_movers_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = BillsAuroraTokens.slate(),
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.04f))
            ) {
                movers.forEachIndexed { index, mover ->
                    if (index > 0) {
                        HorizontalDivider(
                            thickness = 0.5.dp,
                            color = appDividerColor(),
                        )
                    }
                    val isDecrease = mover.delta < 0
                    val toneColor = if (isDecrease) financeIncomeTextColor() else financeExpenseTextColor()
                    val sign = if (mover.delta > 0) "+" else "-"
                    val pctStr = if (mover.percentageDelta != null) {
                        " (${if (mover.percentageDelta > 0) "+" else ""}${mover.percentageDelta}%)"
                    } else ""

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(Color(mover.colorInt))
                        )
                        // Name on top, amounts and change below and wrapping as needed: in one
                        // row, two seven-digit amounts and the badge squeezed the name to nothing
                        // and pushed the badge off a 320dp screen.
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = mover.categoryName,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                                itemVerticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "${CurrencyUtils.formatAmount(mover.priorAmount, currencyCode)} → ${CurrencyUtils.formatAmount(mover.currentAmount, currencyCode)}",
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        fontFeatureSettings = "tnum"
                                    ),
                                    color = BillsAuroraTokens.slate(),
                                )
                                InsightsBadge(
                                    text = "$sign${CurrencyUtils.formatAmount(abs(mover.delta), currencyCode)}$pctStr",
                                    backgroundColor = toneColor.copy(alpha = 0.15f),
                                    contentColor = toneColor,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AllTimeAveragesCard(
    averages: AllTimeAverages,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard()
            .padding(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.insights_all_time_averages_title).uppercase(),
                    style = BillsAuroraTokens.labelStyle(),
                    modifier = Modifier.padding(end = AppSpacing.xs),
                )
                InsightsBadge(
                    text = stringResource(R.string.insights_across_months, averages.monthsCount),
                    backgroundColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            StatCardRow(
                stats = listOf(
                    StatValue(
                        stringResource(R.string.insights_avg_monthly_expenses),
                        CurrencyUtils.formatAmount(averages.averageMonthlyExpenses, currencyCode),
                        financeExpenseTextColor(),
                    ),
                    StatValue(
                        stringResource(R.string.insights_avg_monthly_net),
                        CurrencyUtils.formatAmount(averages.averageMonthlyNet, currencyCode),
                        if (averages.averageMonthlyNet >= 0) financeIncomeTextColor() else financeExpenseTextColor(),
                    ),
                    StatValue(
                        stringResource(R.string.insights_avg_monthly_income),
                        CurrencyUtils.formatAmount(averages.averageMonthlyIncome, currencyCode),
                        financeIncomeTextColor(),
                    ),
                ),
                spacing = 8.dp,
            )
        }
    }
}

@Composable
private fun InsightsBadge(
    text: String,
    backgroundColor: Color,
    contentColor: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(backgroundColor)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum",
                color = contentColor
            ),
        )
    }
}
