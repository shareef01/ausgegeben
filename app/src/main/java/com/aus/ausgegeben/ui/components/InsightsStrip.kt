package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Category
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.SpendingInsights

@Composable
fun InsightsStrip(
    insights: SpendingInsights,
    currencyCode: String,
    modifier: Modifier = Modifier
) {
    val chips = buildList {
        if (insights.daysLoggedThisWeek > 0) {
            add(InsightChipData(
                icon = Icons.Rounded.LocalFireDepartment,
                text = pluralStringResource(
                    R.plurals.insight_days_logged,
                    insights.daysLoggedThisWeek,
                    insights.daysLoggedThisWeek
                ),
                tint = AccentCoral
            ))
        }
        insights.topExpenseCategoryName?.let { name ->
            if (insights.topExpenseCategoryAmount > 0) {
                add(InsightChipData(
                    icon = Icons.Rounded.Category,
                    text = stringResource(
                        R.string.insight_top_category,
                        name,
                        CurrencyUtils.formatAmount(insights.topExpenseCategoryAmount, currencyCode)
                    ),
                    tint = IncomeGreen
                ))
            }
        }
        if (insights.monthExpenseTotal > 0 || insights.monthIncomeTotal > 0) {
            add(InsightChipData(
                icon = Icons.Rounded.CalendarMonth,
                text = buildString {
                    append(stringResource(R.string.insight_month_prefix))
                    if (insights.monthExpenseTotal > 0) {
                        append("−${CurrencyUtils.formatAmount(insights.monthExpenseTotal, currencyCode)}")
                    }
                    if (insights.monthIncomeTotal > 0) {
                        if (insights.monthExpenseTotal > 0) append(" · ")
                        append("+${CurrencyUtils.formatAmount(insights.monthIncomeTotal, currencyCode)}")
                    }
                },
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            ))
        }
    }

    if (chips.isEmpty()) return

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        chips.forEach { chip ->
            InsightChip(chip)
        }
    }
}

private data class InsightChipData(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val text: String,
    val tint: androidx.compose.ui.graphics.Color
)

@Composable
private fun InsightChip(data: InsightChipData) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            data.icon,
            contentDescription = null,
            tint = data.tint,
            modifier = Modifier.padding(end = 10.dp)
        )
        Text(
            text = data.text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun BudgetProgressBar(
    spent: Double,
    budget: Double,
    currencyCode: String,
    modifier: Modifier = Modifier
) {
    if (budget <= 0) return
    val ratio = (spent / budget).toFloat().coerceIn(0f, 1.5f)
    val displayRatio = ratio.coerceAtMost(1f)
    val overBudget = spent > budget
    val barColor = if (overBudget) AccentCoral else IncomeGreen
    val shape = RoundedCornerShape(6.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = stringResource(R.string.budget_monthly_label),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = stringResource(
                    R.string.budget_progress,
                    CurrencyUtils.formatAmount(spent, currencyCode),
                    CurrencyUtils.formatAmount(budget, currencyCode)
                ),
                style = MaterialTheme.typography.labelMedium,
                color = if (overBudget) AccentCoral else MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.SemiBold
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(displayRatio)
                    .height(6.dp)
                    .clip(shape)
                    .background(barColor)
            )
        }
        if (overBudget) {
            Text(
                text = stringResource(
                    R.string.budget_over_by,
                    CurrencyUtils.formatAmount(spent - budget, currencyCode)
                ),
                style = MaterialTheme.typography.labelSmall,
                color = AccentCoral,
                modifier = Modifier.padding(top = 6.dp)
            )
        }
    }
}
