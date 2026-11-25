package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.NameAmountLayout
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils

private object AuroraTokens {
    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant

    @Composable
    fun labelStyle() = sectionLabelStyle()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FinanceSummaryCard(
    expenseTotal: Double,
    incomeTotal: Double,
    net: Double,
    currencyCode: String,
    periodLabel: String,
    transferTotal: Double = 0.0,
    modifier: Modifier = Modifier,
) {
    val incomeColor = financeIncomeTextColor()
    val expenseColor = financeExpenseTextColor()
    val netColor = when {
        net > 0.0 -> incomeColor
        net < 0.0 -> expenseColor
        else -> MaterialTheme.colorScheme.onSurface
    }
    val earned = stringResource(R.string.summary_earned)
    val spent = stringResource(R.string.summary_spent)
    val income = CurrencyUtils.formatAmount(incomeTotal, currencyCode)
    val expenses = CurrencyUtils.formatAmount(expenseTotal, currencyCode)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.sheet))
            .semantics { isTraversalGroup = true }
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.summary_balance_period, "$periodLabel · $currencyCode"),
            modifier = Modifier.semantics { heading() },
            style = sectionLabelStyle(),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(AppSpacing.sm))
        MoneyText(
            text = CurrencyUtils.formatAmount(net, currencyCode),
            modifier = Modifier.fillMaxWidth(),
            color = netColor,
            size = MoneySize.Display,
            fontSize = 36.sp,
        )
        Spacer(Modifier.height(AppSpacing.lg))

        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val fontScale = LocalDensity.current.fontScale.coerceAtLeast(1f)
            if (maxWidth >= 224.dp * fontScale) {
                Row(
                    modifier = Modifier.height(IntrinsicSize.Min),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SummaryPane(earned, income, incomeColor, Icons.Rounded.ArrowUpward, Modifier.weight(1f))
                    VerticalDivider(Modifier.fillMaxHeight(), color = appDividerColor())
                    SummaryPane(spent, expenses, expenseColor, Icons.Rounded.ArrowDownward, Modifier.weight(1f))
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.sm)) {
                    SummaryPane(earned, income, incomeColor, Icons.Rounded.ArrowUpward, Modifier.fillMaxWidth())
                    HorizontalDivider(color = appDividerColor())
                    SummaryPane(spent, expenses, expenseColor, Icons.Rounded.ArrowDownward, Modifier.fillMaxWidth())
                }
            }
        }

        if (transferTotal > 0.0) {
            Spacer(Modifier.height(AppSpacing.md))
            HorizontalDivider(color = appDividerColor())
            Spacer(Modifier.height(AppSpacing.sm))
            val label = stringResource(R.string.bills_section_transfers)
            val amount = CurrencyUtils.formatAmount(transferTotal, currencyCode)
            FlowRow(
                modifier = Modifier.fillMaxWidth().semantics { isTraversalGroup = true },
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.xs, Alignment.CenterHorizontally),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Text(label, style = MaterialTheme.typography.bodySmall, color = readableSecondaryColor())
                MoneyText(amount, color = MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}

@Composable
private fun SummaryPane(
    label: String,
    amount: String,
    color: Color,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .semantics { isTraversalGroup = true }
            .padding(horizontal = AppSpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.height(AppSpacing.xs))
        Text(label, style = sectionLabelStyle(), textAlign = TextAlign.Center)
        Spacer(Modifier.height(AppSpacing.xxs))
        MoneyText(
            text = amount,
            modifier = Modifier.fillMaxWidth(),
            color = color,
            size = MoneySize.Title,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
fun AppLoadingState(
    modifier: Modifier = Modifier,
    message: String = stringResource(R.string.state_loading),
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(48.dp)
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = message
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(36.dp),
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 3.dp,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = readableSecondaryColor(),
            textAlign = TextAlign.Center,
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
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(64.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.03f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = AuroraTokens.slate().copy(alpha = 0.5f),
                modifier = Modifier.size(28.dp),
            )
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = title.uppercase(),
            style = AuroraTokens.labelStyle().copy(color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp),
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = AuroraTokens.slate(),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp),
        )
        if (!hint.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = hint,
                style = MaterialTheme.typography.labelMedium,
                color = AuroraTokens.slate().copy(alpha = 0.75f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp),
            )
        }
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(32.dp))
            AppButton(onClick = onAction) {
                Text(
                    text = actionLabel.uppercase(),
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                )
            }
        }
    }
}
