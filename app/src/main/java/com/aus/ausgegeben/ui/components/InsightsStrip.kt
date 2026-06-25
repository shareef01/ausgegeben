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
import com.aus.ausgegeben.ui.theme.ExpenseMuted
import com.aus.ausgegeben.ui.theme.IncomeGreen

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
    val barColor = if (overBudget) ExpenseMuted else IncomeGreen
    val shape = RoundedCornerShape(AppRadius.sm)
    val cardShape = RoundedCornerShape(AppRadius.lg)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xxs)
            .clip(cardShape)
            .appCard(shape = cardShape)
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm + AppSpacing.xxs)
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
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium
            )
            MoneyText(
                text = androidx.compose.ui.res.stringResource(
                    com.aus.ausgegeben.R.string.budget_progress,
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(spent, currencyCode),
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(budget, currencyCode)
                ),
                size = MoneySize.Body,
                color = if (overBudget) ExpenseMuted else MaterialTheme.colorScheme.onBackground
            )
        }
        Spacer(modifier = Modifier.height(AppSpacing.sm - AppSpacing.xxs))
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .fillMaxWidth(displayRatio)
                    .height(8.dp)
                    .clip(shape)
                    .background(barColor)
            )
        }
        if (overBudget) {
            Text(
                text = androidx.compose.ui.res.stringResource(
                    com.aus.ausgegeben.R.string.budget_over_by,
                    com.aus.ausgegeben.util.CurrencyUtils.formatAmount(spent - budget, currencyCode)
                ),
                style = MaterialTheme.typography.labelSmall,
                color = ExpenseMuted,
                modifier = Modifier.padding(top = AppSpacing.xs)
            )
        }
    }
}
