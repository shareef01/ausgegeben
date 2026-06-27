package com.aus.ausgegeben.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Analytics
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.AnalyticsPeriodPicker
import com.aus.ausgegeben.ui.components.AnimatedCategoryBar
import com.aus.ausgegeben.ui.components.DonutChart
import com.aus.ausgegeben.ui.components.EmptyStateMessage
import com.aus.ausgegeben.ui.components.GroupedSectionLabel
import com.aus.ausgegeben.ui.components.IncomeExpenseOverviewChart
import com.aus.ausgegeben.ui.components.WealthTrendChart
import com.aus.ausgegeben.ui.components.MoneySize
import com.aus.ausgegeben.ui.components.MoneyText
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.appCard
import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.SystemViolet
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.util.analyticsPeriodOptions
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.harmonizedChartColors
import com.aus.ausgegeben.util.iconForCategory

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BillsScreen(
    viewModel: DashboardViewModel,
    currencyCode: String = "EUR",
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val hasAnalytics = uiState.expensesByCategory.isNotEmpty() ||
        uiState.incomeByCategory.isNotEmpty() ||
        uiState.transfersByCategory.isNotEmpty()

    val periodOptions = remember { analyticsPeriodOptions(monthsBack = 14) }
    val expenseTotal = uiState.totalExpenses
    val incomeTotal = uiState.totalIncome
    val hasExpenseChart = uiState.expensesByCategory.isNotEmpty()
    val hasIncomeChart = uiState.incomeByCategory.isNotEmpty()
    val showOverview = expenseTotal > 0 && incomeTotal > 0
    val showDualCharts = hasExpenseChart || hasIncomeChart
    val expenseAccent = financeExpenseColor()
    val incomeAccent = financeIncomeColor()
    val selectedPeriodLabel = if (uiState.periodKey == "all_time") {
        stringResource(R.string.period_all_time)
    } else {
        uiState.periodLabel.ifBlank { periodOptions.getOrNull(1)?.label ?: periodOptions.first().label }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = tabScreenListBottomPadding()
    ) {
        item(key = "title") {
            ScreenTitle(title = stringResource(R.string.screen_bills))
        }

        stickyHeader(key = "period") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(bottom = AppSpacing.xxs)
            ) {
                AnalyticsPeriodPicker(
                    options = periodOptions,
                    selectedKey = uiState.periodKey,
                    selectedLabel = selectedPeriodLabel,
                    onSelected = { viewModel.setPeriodKey(it.storageKey) },
                    modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
                )
            }
        }

        if (!hasAnalytics) {
            item(key = "empty") {
                EmptyStateMessage(
                    icon = Icons.Rounded.Analytics,
                    title = stringResource(R.string.bills_empty_title),
                    subtitle = stringResource(R.string.bills_empty_subtitle),
                    modifier = Modifier.defaultMinSize(minHeight = 280.dp)
                )
            }
        } else {
            if (uiState.cashFlowTrend.isNotEmpty()) {
                item(key = "cash-flow") {
                    WealthTrendChart(
                        points = uiState.cashFlowTrend,
                        currencyCode = currencyCode,
                    )
                }
            }

            if (showOverview) {
                item(key = "overview-chart") {
                    IncomeExpenseOverviewChart(
                        expenseTotal = expenseTotal,
                        incomeTotal = incomeTotal,
                        currencyCode = currencyCode
                    )
                }
            }

            if (showDualCharts) {
                item(key = "category-analytics") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
                        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
                    ) {
                        if (hasExpenseChart) {
                            CategoryAnalyticsCard(
                                title = stringResource(R.string.bills_section_expenses),
                                accent = expenseAccent,
                                data = uiState.expensesByCategory,
                                currencyCode = currencyCode,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (hasIncomeChart) {
                            CategoryAnalyticsCard(
                                title = stringResource(R.string.bills_section_income),
                                accent = incomeAccent,
                                data = uiState.incomeByCategory,
                                currencyCode = currencyCode,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            if (uiState.transfersByCategory.isNotEmpty()) {
                item(key = "transfers-section") {
                    AnalyticsSection(
                        title = stringResource(R.string.bills_section_transfers),
                        data = uiState.transfersByCategory,
                        currencyCode = currencyCode
                    )
                }
            }

            item(key = "footer-spacer") {
                Spacer(modifier = Modifier.height(AppSpacing.xs))
            }
        }
    }
}

@Composable
private fun CategoryAnalyticsCard(
    title: String,
    accent: Color,
    data: Map<Category, Double>,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    val total = data.values.sum()
    if (total <= 0.0) return

    val sorted = remember(data) { data.toList().sortedByDescending { it.second } }
    var expandedCategoryId by remember(data) { mutableStateOf<Long?>(null) }
    val chartColors = remember(sorted) {
        harmonizedChartColors(sorted.map { (category, _) -> category.name to category.colorInt })
    }
    val chartData = remember(sorted) { sorted.associate { (category, amount) -> category.name to amount } }
    val cardShape = RoundedCornerShape(AppRadius.lg)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(cardShape)
            .appCard(shape = cardShape)
            .padding(bottom = AppSpacing.sm),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(accent.copy(alpha = 0.08f))
                .padding(
                    start = AppSpacing.md,
                    end = AppSpacing.md,
                    top = AppSpacing.sm,
                    bottom = AppSpacing.sm,
                ),
        ) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .clip(CircleShape)
                    .background(accent),
            )
            Spacer(modifier = Modifier.width(AppSpacing.xs))
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = accent,
                fontWeight = FontWeight.Medium,
            )
        }
        DonutChart(
            data = chartData,
            colors = chartColors,
            centerLabel = CurrencyUtils.formatAmount(total, currencyCode, showSymbol = false),
            centerSubLabel = stringResource(R.string.chart_total_label),
            chartSize = 120.dp,
            compact = true,
            currencyCode = currencyCode,
            modifier = Modifier.padding(horizontal = AppSpacing.xs),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
        ) {
            sorted.take(5).forEachIndexed { index, (category, amount) ->
                if (index > 0) Spacer(modifier = Modifier.height(AppSpacing.xs))
                val rowColor = chartColors[category.name]
                    ?: colorIntToCompose(category.colorInt).forChartDisplay(index)
                CompactCategoryRow(
                    category = category,
                    amount = amount,
                    total = total,
                    displayColor = rowColor,
                    currencyCode = currencyCode,
                    expanded = expandedCategoryId == category.id,
                    onClick = {
                        expandedCategoryId = if (expandedCategoryId == category.id) null else category.id
                    },
                )
            }
        }
    }
}

@Composable
private fun CompactCategoryRow(
    category: Category,
    amount: Double,
    total: Double,
    displayColor: Color,
    currencyCode: String,
    expanded: Boolean,
    onClick: () -> Unit,
) {
    val ratio = (amount / total).toFloat().coerceIn(0f, 1f)
    val pct = (ratio * 100).toInt()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadius.lg))
            .clickable(onClick = onClick)
            .padding(vertical = AppSpacing.xxs)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(displayColor.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    iconForCategory(category),
                    contentDescription = category.name,
                    tint = displayColor,
                    modifier = Modifier.size(14.dp)
                )
            }
            Spacer(modifier = Modifier.width(AppSpacing.sm))
            Text(
                text = category.name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(modifier = Modifier.width(AppSpacing.sm))
            MoneyText(
                text = CurrencyUtils.formatAmount(amount, currencyCode, showSymbol = true),
                size = MoneySize.Body,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        if (expanded) {
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            Row(verticalAlignment = Alignment.CenterVertically) {
                AnimatedCategoryBar(
                    ratio = ratio,
                    color = displayColor,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(AppSpacing.xs))
                Text(
                    text = "$pct%",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
fun AnalyticsSection(
    title: String,
    data: Map<Category, Double>,
    currencyCode: String = "EUR"
) {
    val total = data.values.sum()
    if (total <= 0.0) return

    val sorted = remember(data) { data.toList().sortedByDescending { it.second } }
    val chartColors = remember(sorted) {
        harmonizedChartColors(sorted.map { (category, _) -> category.name to category.colorInt })
    }
    val chartData = remember(sorted) { sorted.associate { (category, amount) -> category.name to amount } }
    val cardShape = RoundedCornerShape(AppRadius.lg)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
    ) {
        GroupedSectionLabel(text = title)

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(cardShape)
                .appCard(shape = cardShape)
        ) {
            DonutChart(
                data = chartData,
                colors = chartColors,
                centerLabel = CurrencyUtils.formatAmount(total, currencyCode),
                centerSubLabel = stringResource(R.string.chart_total_label),
                currencyCode = currencyCode,
                modifier = Modifier.padding(top = AppSpacing.md, bottom = AppSpacing.xs)
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = AppSpacing.md, end = AppSpacing.md, bottom = AppSpacing.md)
            ) {
                sorted.forEachIndexed { index, (category, amount) ->
                    if (index > 0) Spacer(modifier = Modifier.height(2.dp))
                    val rowColor = chartColors[category.name]
                        ?: colorIntToCompose(category.colorInt).forChartDisplay(index)
                    CategoryProgressRow(
                        category = category,
                        amount = amount,
                        total = total,
                        displayColor = rowColor,
                        currencyCode = currencyCode,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun CategoryProgressRow(
    category: Category,
    amount: Double,
    total: Double,
    displayColor: Color,
    currencyCode: String = "EUR",
    modifier: Modifier = Modifier
) {
    val ratio = (amount / total).toFloat().coerceIn(0f, 1f)
    val pct = (ratio * 100).toInt()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 52.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(displayColor.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(category),
                contentDescription = category.name,
                tint = displayColor,
                modifier = Modifier.size(16.dp)
            )
        }
        Spacer(modifier = Modifier.width(AppSpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = category.name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            AnimatedCategoryBar(ratio = ratio, color = displayColor)
        }
        Spacer(modifier = Modifier.width(AppSpacing.md))
        Column(horizontalAlignment = Alignment.End) {
            MoneyText(
                text = CurrencyUtils.formatAmount(amount, currencyCode, showSymbol = true),
                size = MoneySize.Body,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "$pct%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}
