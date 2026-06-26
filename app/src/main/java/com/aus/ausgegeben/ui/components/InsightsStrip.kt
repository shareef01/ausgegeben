package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor

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
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val barColor = if (overBudget) expenseColor else incomeColor
    val trackShape = RoundedCornerShape(AppRadius.pill)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = androidx.compose.ui.res.stringResource(
                    com.aus.ausgegeben.R.string.budget_monthly_label
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            MoneyText(
                text = androidx.compose.ui.res.stringResource(
                    com.aus.ausgegeben.R.string.budget_progress,
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(spent, currencyCode),
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(budget, currencyCode)
                ),
                size = MoneySize.Body,
                color = if (overBudget) expenseColor else MaterialTheme.colorScheme.onBackground
            )
        }
        Spacer(modifier = Modifier.height(AppSpacing.sm))
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .clip(trackShape)
                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f))
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .fillMaxWidth(displayRatio)
                    .height(3.dp)
                    .clip(trackShape)
                    .background(barColor.copy(alpha = 0.85f))
            )
        }
        if (overBudget) {
            Text(
                text = androidx.compose.ui.res.stringResource(
                    com.aus.ausgegeben.R.string.budget_over_by,
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(spent - budget, currencyCode)
                ),
                style = MaterialTheme.typography.bodySmall,
                color = expenseColor,
                modifier = Modifier.padding(top = AppSpacing.xs)
            )
        }
    }
}
