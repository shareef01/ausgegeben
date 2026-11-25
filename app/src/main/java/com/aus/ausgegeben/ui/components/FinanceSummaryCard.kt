package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
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
    val periodAndCurrency = "$periodLabel · $currencyCode"
    val netAmount = CurrencyUtils.formatAmount(net, currencyCode)
    val earnedAmount = CurrencyUtils.formatAmount(incomeTotal, currencyCode)
    val spentAmount = CurrencyUtils.formatAmount(expenseTotal, currencyCode)
    val summaryDescription = stringResource(
        R.string.desc_finance_summary,
        periodAndCurrency,
        netAmount,
        earnedAmount,
        spentAmount,
    )
    val incomeText = financeIncomeTextColor()
    val expenseText = financeExpenseTextColor()
    val netColor = when {
        net > 0 -> incomeText
        net < 0 -> expenseText
        else -> MaterialTheme.colorScheme.onSurface
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
            .semantics { contentDescription = summaryDescription }
            .padding(AppSpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.summary_balance_period, periodAndCurrency),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        MoneyText(
            text = netAmount,
            modifier = Modifier.fillMaxWidth().padding(vertical = AppSpacing.sm),
            color = netColor,
            size = MoneySize.Display,
            fontSize = 36.sp,
        )
        HorizontalDivider(color = appDividerColor())
        SummaryAmountRow(stringResource(R.string.summary_earned), earnedAmount, incomeText)
        SummaryAmountRow(stringResource(R.string.summary_spent), spentAmount, expenseText)
        if (transferTotal > 0) {
            SummaryAmountRow(
                stringResource(R.string.bills_total_transfers),
                CurrencyUtils.formatAmount(transferTotal, currencyCode),
                financeTransferColor(),
            )
        }
    }
}

@Composable
private fun SummaryAmountRow(label: String, amount: String, amountColor: Color) {
    NameAmountLayout(
        modifier = Modifier.fillMaxWidth().padding(top = AppSpacing.xs),
        name = {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        amount = {
            MoneyText(text = amount, color = amountColor, textAlign = TextAlign.End)
        },
    )
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
