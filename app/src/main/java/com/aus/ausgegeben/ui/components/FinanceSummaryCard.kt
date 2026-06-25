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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.text.style.TextAlign
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.ExpenseMuted
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.AppIconSize
import com.aus.ausgegeben.ui.theme.AppLayoutTokens
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.util.CurrencyUtils
import androidx.compose.ui.unit.dp

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
    val shape = RoundedCornerShape(AppRadius.card)
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
                modifier = Modifier.padding(
                    top = AppSpacing.xxs + AppSpacing.xxs,
                    bottom = if (compact) AppSpacing.sm else AppSpacing.md + AppSpacing.xxs,
                )
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (!compact) Modifier.height(IntrinsicSize.Min) else Modifier),
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm)
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
                    modifier = Modifier.padding(top = AppSpacing.sm)
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
                    modifier = Modifier.padding(
                        top = if (insightLine != null) AppSpacing.xxs + AppSpacing.xxs else AppSpacing.sm,
                    )
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
    val shape = RoundedCornerShape(AppRadius.md)
    val verticalPadding = if (compact) AppSpacing.sm + AppSpacing.xxs else AppSpacing.sm
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tint.copy(alpha = 0.1f))
            .padding(horizontal = AppSpacing.sm, vertical = verticalPadding),
        verticalArrangement = Arrangement.spacedBy(AppSpacing.xxs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(AppIconSize.md))
            Spacer(modifier = Modifier.width(AppSpacing.xxs))
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
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
    hint: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val primary = MaterialTheme.colorScheme.primary
    val onPrimary = MaterialTheme.colorScheme.onPrimary
    Column(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = AppLayoutTokens.emptyStateMinHeight)
            .padding(horizontal = AppSpacing.xl, vertical = AppSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(AppLayoutTokens.emptyStateIconWell)
                .clip(RoundedCornerShape(AppRadius.pill))
                .background(primary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = primary,
                modifier = Modifier.size(AppIconSize.lg + AppSpacing.xxs),
            )
        }
        Spacer(modifier = Modifier.height(AppSpacing.md))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(AppSpacing.xxs))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = AppSpacing.md),
        )
        if (hint != null) {
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            Text(
                text = hint,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                textAlign = TextAlign.Center,
            )
        }
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(AppSpacing.lg))
            Button(
                onClick = onAction,
                shape = RoundedCornerShape(AppRadius.md),
                colors = ButtonDefaults.buttonColors(
                    containerColor = primary,
                    contentColor = onPrimary,
                ),
            ) {
                Text(actionLabel, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
