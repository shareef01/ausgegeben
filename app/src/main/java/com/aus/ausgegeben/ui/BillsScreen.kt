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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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

private object BillsAuroraTokens {
    @Composable
    fun slate() = readableSecondaryColor()

    @Composable
    fun labelStyle() = sectionLabelStyle()
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun BillsScreen(
    viewModel: DashboardViewModel,
    currencyCode: String = "EUR",
    onAddTransaction: () -> Unit = {},
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

                if (!hasAnalytics) {
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
                    if (expenseTotal > 0 || incomeTotal > 0) {
                        item(key = "overview") {
                            val revealAlpha = remember(entranceKey) { Animatable(0f) }
                            LaunchedEffect(entranceKey) {
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
                                            isIncome = false
                                        )
                                    }
                                }
                                if (uiState.incomeByCategory.isNotEmpty()) {
                                    Box(modifier = Modifier.weight(1f)) {
                                        CategoryAnalyticsIsland(
                                            title = stringResource(R.string.bills_section_income),
                                            data = uiState.incomeByCategory,
                                            currencyCode = currencyCode,
                                            isIncome = true
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
                                        isIncome = false
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
                                        isIncome = true
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
                                    .then(if (isWide) Modifier.fillMaxWidth(0.85f).fillMaxWidth() else Modifier),
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

                    item(key = "footer") { Spacer(Modifier.height(AppSpacing.xxl)) }
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
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm)
    ) {
        StatCard(
            label = stringResource(R.string.summary_spent),
            value = CurrencyUtils.formatAmount(expense, currencyCode),
            color = financeExpenseColor(),
            modifier = Modifier.weight(1f)
        )
        StatCard(
            label = stringResource(R.string.chart_net_label),
            value = CurrencyUtils.formatAmount(net, currencyCode),
            color = if (net >= 0) financeIncomeColor() else financeExpenseColor(),
            modifier = Modifier.weight(1f)
        )
        StatCard(
            label = stringResource(R.string.summary_earned),
            value = CurrencyUtils.formatAmount(income, currencyCode),
            color = financeIncomeColor(),
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun StatCard(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .appGlassCard(RoundedCornerShape(AppRadius.md))
            .padding(vertical = 12.dp, horizontal = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = label.uppercase(),
                style = BillsAuroraTokens.labelStyle().copy(fontSize = 9.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = value,
                style = TextStyle(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum",
                    color = color
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column {
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
                Text(
                    text = trend.lastOrNull()?.label ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = readableSecondaryColor()
                )
            }
        }
    }
}

@Composable
private fun CategoryAnalyticsIsland(
    title: String,
    data: Map<Category, Double>,
    currencyCode: String,
    isIncome: Boolean = false,
) {
    val total = data.values.sum()
    val sorted = remember(data) { data.toList().sortedByDescending { it.second } }
    val chartColors = remember(sorted) {
        harmonizedChartColors(sorted.map { (category, _) -> category.name to category.colorInt })
    }
    val chartData = remember(sorted) { sorted.associate { (category, amount) -> category.name to amount } }

    val accentColor = if (isIncome) financeIncomeColor() else financeExpenseColor()

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
                centerSubLabel = if (isIncome) "TOTAL INCOME" else "TOTAL EXPENSE",
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
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = category.name,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "$percent%",
                style = MaterialTheme.typography.labelSmall,
                color = BillsAuroraTokens.slate(),
            )
        }
        Spacer(Modifier.width(16.dp))
        Text(
            text = CurrencyUtils.formatAmount(amount, currencyCode),
            style = TextStyle(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum",
                color = MaterialTheme.colorScheme.onSurface,
            ),
        )
    }
}
