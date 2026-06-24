package com.aus.ausgegeben.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.AnimatedCategoryBar
import com.aus.ausgegeben.ui.components.DonutChart
import com.aus.ausgegeben.ui.components.EmptyStateMessage
import com.aus.ausgegeben.ui.components.GroupedSectionLabel
import com.aus.ausgegeben.ui.components.IosSegmentedControl
import com.aus.ausgegeben.ui.components.ScreenTitle
import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.ui.theme.AmountTextStyle
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.SystemTeal
import com.aus.ausgegeben.ui.theme.SystemViolet
import com.aus.ausgegeben.ui.theme.TransferGray
import com.aus.ausgegeben.ui.theme.chartHighlight
import com.aus.ausgegeben.ui.theme.chartShadow
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.harmonizedChartColors
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill

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

    val periodOptions = AnalyticsPeriod.entries.map { it.label() }
    val headerPeriodLabel = when (uiState.period) {
        AnalyticsPeriod.ALL_TIME -> stringResource(R.string.period_all_time)
        else -> uiState.periodLabel
    }

    Column(modifier = modifier.fillMaxSize()) {
        ScreenTitle(title = stringResource(R.string.screen_bills))

        IosSegmentedControl(
            options = periodOptions,
            selectedIndex = AnalyticsPeriod.entries.indexOf(uiState.period).coerceAtLeast(0),
            onSelected = { viewModel.setPeriod(AnalyticsPeriod.entries[it]) },
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )

        if (hasAnalytics) {
            RecordHeader(
                expenses = uiState.periodTransactions,
                currencyCode = currencyCode,
                periodLabel = headerPeriodLabel
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = tabScreenListBottomPadding()
        ) {
            if (!hasAnalytics) {
                item {
                    EmptyStateMessage(
                        icon = Icons.Rounded.Analytics,
                        title = stringResource(R.string.bills_empty_title),
                        subtitle = stringResource(R.string.bills_empty_subtitle),
                        modifier = Modifier.defaultMinSize(minHeight = 240.dp)
                    )
                }
            }

            if (uiState.expensesByCategory.isNotEmpty()) {
                item(key = "expenses-section") {
                    AnalyticsSection(
                        title = stringResource(R.string.bills_section_expenses),
                        accent = AccentCoral,
                        accentSecondary = Color(0xFFFFBE7A),
                        data = uiState.expensesByCategory,
                        currencyCode = currencyCode
                    )
                }
            }

            if (uiState.incomeByCategory.isNotEmpty()) {
                item(key = "income-section") {
                    AnalyticsSection(
                        title = stringResource(R.string.bills_section_income),
                        accent = IncomeGreen,
                        accentSecondary = SystemTeal,
                        data = uiState.incomeByCategory,
                        currencyCode = currencyCode
                    )
                }
            }

            if (uiState.transfersByCategory.isNotEmpty()) {
                item(key = "transfers-section") {
                    AnalyticsSection(
                        title = stringResource(R.string.bills_section_transfers),
                        accent = SystemViolet,
                        accentSecondary = TransferGray,
                        data = uiState.transfersByCategory,
                        currencyCode = currencyCode
                    )
                }
            }

            item { Spacer(modifier = Modifier.height(8.dp)) }
        }
    }
}

@Composable
fun AnalyticsSection(
    title: String,
    accent: Color,
    accentSecondary: Color,
    data: Map<Category, Double>,
    currencyCode: String = "EUR"
) {
    val total = data.values.sum()
    if (total <= 0.0) return

    val sorted = data.toList().sortedByDescending { it.second }
    val chartColors = harmonizedChartColors(
        sorted.map { (category, _) -> category.name to category.colorInt }
    )
    val cardShape = RoundedCornerShape(24.dp)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
    ) {
        GroupedSectionLabel(text = title)

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(10.dp, cardShape, ambientColor = accent.copy(alpha = 0.12f))
                .clip(cardShape)
                .border(
                    width = 1.dp,
                    brush = Brush.linearGradient(
                        colors = listOf(
                            accent.copy(alpha = 0.35f),
                            accentSecondary.copy(alpha = 0.12f),
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.08f)
                        )
                    ),
                    shape = cardShape
                )
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(accent, accentSecondary)
                        )
                    )
            )

            DonutChart(
                data = sorted.associate { (category, amount) -> category.name to amount },
                colors = chartColors,
                centerLabel = CurrencyUtils.formatAmount(total, currencyCode),
                centerSubLabel = stringResource(R.string.chart_total_label),
                modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 16.dp, bottom = 16.dp)
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
            .defaultMinSize(minHeight = 56.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(40.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            displayColor.chartHighlight(),
                            displayColor,
                            displayColor.chartShadow()
                        )
                    )
                )
        )
        Spacer(modifier = Modifier.width(12.dp))
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(displayColor.copy(alpha = 0.18f))
                .border(1.dp, displayColor.copy(alpha = 0.35f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(category),
                contentDescription = category.name,
                tint = displayColor,
                modifier = Modifier.size(17.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = category.name,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(6.dp))
            AnimatedCategoryBar(ratio = ratio, color = displayColor)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = CurrencyUtils.formatAmount(amount, currencyCode, showSymbol = true),
                style = MaterialTheme.typography.bodyMedium.merge(AmountTextStyle),
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "$pct%",
                style = MaterialTheme.typography.labelSmall,
                color = displayColor,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}
