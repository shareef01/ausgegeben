package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseTextColor
import com.aus.ausgegeben.ui.theme.financeWarningColor
import com.aus.ausgegeben.ui.theme.financeWarningTextColor
import com.aus.ausgegeben.util.CurrencyUtils
import java.text.NumberFormat

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BudgetProgressBar(
    spent: Double,
    budget: Double,
    currencyCode: String,
    /** Current-month expenses dated tomorrow or later; informational, never counted as spent. */
    upcoming: Double = 0.0,
    modifier: Modifier = Modifier,
    incomplete: Boolean = false,
) {
    if (budget <= 0) return
    val ratio = (spent / budget).coerceAtLeast(0.0)
    val displayRatio = ratio.coerceAtMost(1.0).toFloat()
    val overBudget = spent > budget
    // Approved F-05 rule: red only when actual spending is over; amber when actual is
    // within budget but the anticipated total (actual + upcoming) is over.
    val projectedOver = !overBudget && spent + upcoming > budget
    val nearLimit = ratio >= 0.8 && spent < budget && !projectedOver
    val expenseColor = financeExpenseTextColor()
    val barColor = when {
        overBudget -> expenseColor
        projectedOver -> financeWarningColor()
        else -> MaterialTheme.colorScheme.onSurface
    }
    val percent = NumberFormat.getPercentInstance(CurrencyUtils.localeForDisplay())
        .apply { maximumFractionDigits = 1 }.format(ratio)
    val trackShape = RoundedCornerShape(AppRadius.pill)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
    ) {
        // "Spent / budget" moves under the label when both do not fit on one line; it used
        // to be ellipsised to "145.93..." beside the label.
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            itemVerticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.budget_monthly_label),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            MoneyText(
                text = stringResource(
                    R.string.budget_progress,
                    CurrencyUtils.formatAmount(spent, currencyCode),
                    CurrencyUtils.formatAmount(budget, currencyCode)
                ),
                size = MoneySize.Body,
                color = if (overBudget) expenseColor else MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.End,
            )
        }
        Spacer(modifier = Modifier.height(AppSpacing.sm))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(trackShape)
                .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(displayRatio)
                    .height(6.dp)
                    .clip(trackShape)
                    .background(barColor)
            )
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(top = AppSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm, Alignment.Start),
        ) {
            Text(
                text = stringResource(R.string.budget_used, percent),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!incomplete || overBudget) {
                val status = when {
                    overBudget -> stringResource(R.string.budget_over_by, CurrencyUtils.formatAmount(spent - budget, currencyCode))
                    spent == budget -> stringResource(R.string.budget_reached)
                    else -> stringResource(R.string.budget_remaining, CurrencyUtils.formatAmount(budget - spent, currencyCode))
                }
                Text(
                    text = status,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (overBudget) expenseColor else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (nearLimit || incomplete) {
            Text(
                text = stringResource(if (incomplete) R.string.record_cache_incomplete else R.string.budget_near_limit),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (projectedOver) {
            Text(
                text = stringResource(
                    R.string.budget_projected_exceed,
                    CurrencyUtils.formatAmount(spent + upcoming - budget, currencyCode)
                ),
                style = MaterialTheme.typography.bodySmall,
                color = financeWarningTextColor(),
                modifier = Modifier.padding(top = AppSpacing.xs)
            )
        }
        if (upcoming > 0) {
            // Additive clarification (F-05): the bar stays actual-spend / budget. A
            // future-dated row is shown, with the anticipated total, so this number cannot
            // be mistaken for money already spent.
            Text(
                text = stringResource(
                    R.string.budget_upcoming_anticipated,
                    CurrencyUtils.formatAmount(upcoming, currencyCode),
                    CurrencyUtils.formatAmount(spent + upcoming, currencyCode)
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AppSpacing.xs)
            )
        }
    }
}
