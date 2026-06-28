package com.aus.ausgegeben.ui

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
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.*

private object BillsAuroraTokens {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun surface() = MaterialTheme.colorScheme.surface

    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant

    @Composable
    fun emerald() = Color(0xFF10B981)
    
    // Pillar 1: Ambient Aurora Background
    @Composable
    fun auroraBrush() = Brush.radialGradient(
        colors = listOf(emerald().copy(alpha = if (isAppDarkTheme()) 0.12f else 0.06f), Color.Transparent),
        radius = 1200f,
        center = Offset(x = 0f, y = 0f)
    )

    // Pillar 2: Adaptive Glassmorphism
    @Composable
    fun glassBase() = if (isAppDarkTheme()) {
        Color(0xFFFFFFFF).copy(alpha = 0.03f)
    } else {
        Color(0xFF000000).copy(alpha = 0.03f)
    }

    @Composable
    fun specularBorder() = if (isAppDarkTheme()) {
        Brush.linearGradient(
            colors = listOf(Color.White.copy(alpha = 0.15f), Color.Transparent),
            start = Offset(0f, 0f),
            end = Offset(100f, 100f)
        )
    } else {
        Brush.linearGradient(
            colors = listOf(Color.Black.copy(alpha = 0.1f), Color.Transparent),
            start = Offset(0f, 0f),
            end = Offset(100f, 100f)
        )
    }

    @Composable
    fun labelStyle() = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
        color = slate()
    )
}

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
    val selectedPeriodLabel = if (uiState.periodKey == "all_time") {
        stringResource(R.string.period_all_time)
    } else {
        uiState.periodLabel.ifBlank { periodOptions.getOrNull(1)?.label ?: periodOptions.first().label }
    }

    // Pillar 1: Ambient Aurora Canvas
    Box(modifier = modifier.fillMaxSize().background(BillsAuroraTokens.background())) {
        Box(modifier = Modifier.fillMaxSize().background(BillsAuroraTokens.auroraBrush()))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = tabScreenListBottomPadding()
        ) {
            item(key = "title") {
                ScreenTitle(title = stringResource(R.string.screen_bills))
            }

            stickyHeader(key = "period") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Transparent)
                        .padding(bottom = AppSpacing.sm)
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
                    )
                }
            } else {
                if (expenseTotal > 0 || incomeTotal > 0) {
                    item(key = "overview") {
                        IncomeExpenseOverviewChart(
                            expenseTotal = expenseTotal,
                            incomeTotal = incomeTotal,
                            currencyCode = currencyCode
                        )
                    }
                }

                if (uiState.expensesByCategory.isNotEmpty()) {
                    item(key = "expenses-card") {
                        CategoryAnalyticsIsland(
                            title = stringResource(R.string.bills_section_expenses),
                            data = uiState.expensesByCategory,
                            currencyCode = currencyCode,
                            isIncome = false
                        )
                    }
                }

                if (uiState.incomeByCategory.isNotEmpty()) {
                    item(key = "income-card") {
                        CategoryAnalyticsIsland(
                            title = stringResource(R.string.bills_section_income),
                            data = uiState.incomeByCategory,
                            currencyCode = currencyCode,
                            isIncome = true
                        )
                    }
                }

                item(key = "footer") { Spacer(Modifier.height(AppSpacing.xxl)) }
            }
        }
    }
}

@Composable
private fun CategoryAnalyticsIsland(
    title: String,
    data: Map<Category, Double>,
    currencyCode: String,
    isIncome: Boolean
) {
    val total = data.values.sum()
    val sorted = remember(data) { data.toList().sortedByDescending { it.second } }
    val chartColors = remember(sorted) {
        harmonizedChartColors(sorted.map { (category, _) -> category.name to category.colorInt })
    }
    val chartData = remember(sorted) { sorted.associate { (category, amount) -> category.name to amount } }

    // Pillar 2: Glassmorphism Island - Law 3: Consistent geometric anchors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(BillsAuroraTokens.glassBase())
            .border(
                width = 1.dp, 
                brush = BillsAuroraTokens.specularBorder(), 
                shape = RoundedCornerShape(24.dp)
            )
            .padding(20.dp)
    ) {
        Column {
            Text(
                text = title.uppercase(),
                style = BillsAuroraTokens.labelStyle()
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
                    CategoryMetricRow(category, amount, color, currencyCode)
                    if (index < sorted.lastIndex) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        )
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
    currencyCode: String
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Pillar 4: Subtly tinted icon background
        Box(
            modifier = Modifier.size(8.dp).clip(CircleShape).background(color.copy(alpha = 0.2f))
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = category.name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(16.dp))
        Text(
            text = CurrencyUtils.formatAmount(amount, currencyCode),
            style = TextStyle(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                fontFeatureSettings = "tnum",
                color = MaterialTheme.colorScheme.onSurface
            )
        )
    }
}
