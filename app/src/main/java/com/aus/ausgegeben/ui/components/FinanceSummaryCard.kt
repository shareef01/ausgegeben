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
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.ui.theme.AmountTextStyle
import com.aus.ausgegeben.ui.theme.ExpenseMuted
import com.aus.ausgegeben.ui.theme.IncomeGreen
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
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(24.dp)
    val netColor = when {
        net > 0 -> IncomeGreen
        net < 0 -> ExpenseMuted
        else -> MaterialTheme.colorScheme.onBackground
    }
    val borderBrush = Brush.linearGradient(
        colors = listOf(
            AccentCoral.copy(alpha = 0.3f),
            IncomeGreen.copy(alpha = 0.18f),
            MaterialTheme.colorScheme.outline.copy(alpha = 0.06f)
        )
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 156.dp)
            .padding(horizontal = 16.dp)
            .shadow(16.dp, shape, ambientColor = AccentCoral.copy(alpha = 0.1f))
            .clip(shape)
            .border(1.dp, borderBrush, shape)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f),
                        MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)
                    )
                )
            )
            .padding(24.dp)
    ) {
        Text(
            text = stringResource(R.string.summary_balance_period, periodLabel),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = CurrencyUtils.formatAmount(net, currencyCode),
            style = MaterialTheme.typography.headlineLarge.merge(AmountTextStyle),
            color = netColor,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 6.dp, bottom = 20.dp)
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            BalancePill(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .defaultMinSize(minHeight = 84.dp),
                label = stringResource(R.string.summary_spent),
                value = CurrencyUtils.formatAmount(expenseTotal, currencyCode),
                icon = Icons.AutoMirrored.Rounded.TrendingDown,
                tint = ExpenseMuted
            )
            BalancePill(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .defaultMinSize(minHeight = 84.dp),
                label = stringResource(R.string.summary_earned),
                value = CurrencyUtils.formatAmount(incomeTotal, currencyCode),
                icon = Icons.AutoMirrored.Rounded.TrendingUp,
                tint = IncomeGreen
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
                modifier = Modifier.padding(top = 14.dp)
            )
        }
    }
}

@Composable
private fun BalancePill(
    label: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 72.dp)
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        tint.copy(alpha = 0.10f),
                        MaterialTheme.colorScheme.surface.copy(alpha = 0.55f)
                    )
                )
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium.merge(AmountTextStyle),
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(top = 6.dp)
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
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(36.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(32.dp)
            )
        }
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp)
        )
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = onAction,
                shape = RoundedCornerShape(14.dp)
            ) {
                Text(actionLabel)
            }
        }
    }
}
