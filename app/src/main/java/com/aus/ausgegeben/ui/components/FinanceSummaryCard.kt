package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.ExpenseMuted
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.AppSpacing
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
    val shape = RoundedCornerShape(AppSpacing.lg - AppSpacing.xxs)
    val netColor = when {
        net > 0 -> IncomeGreen
        net < 0 -> ExpenseMuted
        else -> MaterialTheme.colorScheme.onBackground
    }
    val contentPadding = if (compact) AppSpacing.md else AppSpacing.lg

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md)
            .clip(shape)
            .appCard(shape = shape)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = contentPadding, vertical = contentPadding)
        ) {
            Text(
                text = stringResource(R.string.summary_balance_period, periodLabel).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
            MoneyText(
                text = CurrencyUtils.formatAmount(net, currencyCode),
                size = if (compact) MoneySize.Headline else MoneySize.Display,
                color = netColor,
                modifier = Modifier.padding(top = 6.dp, bottom = if (compact) 12.dp else 18.dp)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (!compact) Modifier.height(IntrinsicSize.Min) else Modifier),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                BalancePill(
                    modifier = Modifier.weight(1f).then(if (!compact) Modifier.fillMaxHeight() else Modifier),
                    label = stringResource(R.string.summary_spent),
                    value = CurrencyUtils.formatAmount(expenseTotal, currencyCode),
                    icon = Icons.AutoMirrored.Rounded.TrendingDown,
                    tint = ExpenseMuted,
                    compact = compact
                )
                BalancePill(
                    modifier = Modifier.weight(1f).then(if (!compact) Modifier.fillMaxHeight() else Modifier),
                    label = stringResource(R.string.summary_earned),
                    value = CurrencyUtils.formatAmount(incomeTotal, currencyCode),
                    icon = Icons.AutoMirrored.Rounded.TrendingUp,
                    tint = IncomeGreen,
                    compact = compact
                )
            }

            insightLine?.let { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp)
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
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = if (insightLine != null) 6.dp else 12.dp)
                )
            }
        }
    }
}

@Composable
private fun BalancePill(
    label: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(12.dp)
    val verticalPadding = if (compact) 10.dp else 12.dp
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.1f))
            .padding(horizontal = 12.dp, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(AppSpacing.sm + AppSpacing.xxs))
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
        }
        MoneyText(
            text = value,
            size = if (compact) MoneySize.Body else MoneySize.Title,
            color = tint,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun EmptyStateMessage(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    val primary = MaterialTheme.colorScheme.primary
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(RoundedCornerShape(34.dp))
                .background(primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = primary,
                modifier = Modifier.size(30.dp)
            )
        }
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(20.dp))
            androidx.compose.material3.TextButton(onClick = onAction) {
                Text(actionLabel, color = primary)
            }
        }
    }
}
