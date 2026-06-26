package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppIconSize
import com.aus.ausgegeben.ui.theme.AppLayoutTokens
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpringSnappy
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.util.CurrencyUtils

@Composable
fun FinanceSummaryCard(
    expenseTotal: Double,
    incomeTotal: Double,
    net: Double,
    currencyCode: String,
    transferCount: Int = 0,
    transferTotal: Double = 0.0,
    periodLabel: String = "all time",
    insightLine: String? = null,
    compact: Boolean = false,
    modifier: Modifier = Modifier
) {
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val netColor = when {
        net > 0 -> incomeColor
        net < 0 -> expenseColor
        else -> MaterialTheme.colorScheme.onBackground
    }
    val totalFlow = expenseTotal + incomeTotal
    val incomeRatio by animateFloatAsState(
        targetValue = if (totalFlow > 0.0) (incomeTotal / totalFlow).toFloat().coerceIn(0.08f, 0.92f) else 0.5f,
        animationSpec = AppSpringSnappy,
        label = "summaryIncomeRatio"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md)
            .padding(bottom = if (compact) AppSpacing.xs else AppSpacing.sm)
            .clip(RoundedCornerShape(AppRadius.xl))
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.linearGradient(
                        listOf(
                            incomeColor.copy(alpha = 0.14f),
                            MaterialTheme.colorScheme.surface,
                            expenseColor.copy(alpha = 0.10f),
                        )
                    )
                )
        )
        Column(modifier = Modifier.padding(AppSpacing.md)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.summary_balance_period, periodLabel),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Normal,
                )
                MoneyText(
                    text = CurrencyUtils.formatAmount(net, currencyCode),
                    size = MoneySize.Hero,
                    color = netColor,
                    fontWeight = FontWeight.SemiBold,
                    animateChanges = true,
                    modifier = Modifier.padding(top = AppSpacing.xxs),
                )
            }
            NetStatusPill(
                text = when {
                    net > 0 -> "+"
                    net < 0 -> "-"
                    else -> "="
                },
                color = netColor,
            )
        }

        Text(
            text = when {
                net > 0 -> stringResource(R.string.summary_earned)
                net < 0 -> stringResource(R.string.summary_spent)
                else -> stringResource(R.string.chart_net_label)
            },
            style = MaterialTheme.typography.labelSmall,
            color = netColor.copy(alpha = 0.82f),
            modifier = Modifier.padding(top = AppSpacing.xxs),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = AppSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        ) {
            SummaryStat(
                label = stringResource(R.string.summary_earned),
                value = CurrencyUtils.formatAmount(incomeTotal, currencyCode),
                color = incomeColor,
                modifier = Modifier.weight(1f),
            )
            SummaryStat(
                label = stringResource(R.string.summary_spent),
                value = CurrencyUtils.formatAmount(expenseTotal, currencyCode),
                color = expenseColor,
                modifier = Modifier.weight(1f),
            )
        }

        FlowBalanceBar(
            incomeRatio = incomeRatio,
            expenseColor = expenseColor,
            incomeColor = incomeColor,
            modifier = Modifier.padding(top = AppSpacing.md),
        )

        insightLine?.let { line ->
            Text(
                text = line,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = AppSpacing.sm),
            )
        }

        if (transferCount > 0) {
            Text(
                text = pluralStringResource(
                    R.plurals.summary_transfers,
                    transferCount,
                    transferCount,
                    CurrencyUtils.formatAmount(transferTotal, currencyCode)
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = AppSpacing.xs),
            )
        }
        }
    }
}

@Composable
private fun SummaryStat(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(AppRadius.lg))
            .background(color.copy(alpha = 0.1f))
            .padding(horizontal = AppSpacing.sm, vertical = AppSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color),
        )
        Column(modifier = Modifier.padding(start = AppSpacing.xs)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Normal,
            )
            MoneyText(
                text = value,
                size = MoneySize.Body,
                color = color,
                fontWeight = FontWeight.Medium,
                animateChanges = true,
                modifier = Modifier.padding(top = 1.dp),
            )
        }
    }
}

@Composable
private fun FlowBalanceBar(
    incomeRatio: Float,
    expenseColor: Color,
    incomeColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(AppRadius.pill))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)),
    ) {
        Box(
            modifier = Modifier
                .weight((1f - incomeRatio).coerceAtLeast(0.05f))
                .height(8.dp)
                .background(expenseColor.copy(alpha = 0.85f)),
        )
        Box(
            modifier = Modifier
                .weight(incomeRatio.coerceAtLeast(0.05f))
                .height(8.dp)
                .background(incomeColor.copy(alpha = 0.9f)),
        )
    }
}

@Composable
private fun NetStatusPill(text: String, color: Color) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            color = color,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
fun EmptyStateMessage(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = AppLayoutTokens.emptyStateMinHeight)
            .padding(horizontal = AppSpacing.xl, vertical = AppSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = muted.copy(alpha = 0.45f),
            modifier = Modifier.size(AppIconSize.lg),
        )
        Spacer(modifier = Modifier.height(AppSpacing.md))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Normal,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(AppSpacing.xxs))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = AppSpacing.md),
        )
        if (hint != null) {
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            Text(
                text = hint,
                style = MaterialTheme.typography.bodySmall,
                color = muted.copy(alpha = 0.75f),
                textAlign = TextAlign.Center,
            )
        }
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(AppSpacing.lg))
            Button(
                onClick = onAction,
                shape = RoundedCornerShape(AppRadius.md),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.onBackground,
                    contentColor = MaterialTheme.colorScheme.background,
                ),
            ) {
                Text(actionLabel, fontWeight = FontWeight.Medium)
            }
        }
    }
}
