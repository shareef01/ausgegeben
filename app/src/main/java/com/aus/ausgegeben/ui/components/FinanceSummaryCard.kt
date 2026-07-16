package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.ui.theme.isAppDarkTheme
import com.aus.ausgegeben.ui.theme.sectionLabelStyle
import com.aus.ausgegeben.util.CurrencyUtils
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*

private object AuroraTokens {
    @Composable
    fun emerald() = financeIncomeColor()

    @Composable
    fun crimson() = financeExpenseColor()

    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant
    
    // Pillar 3: Dynamic Multi-tone Brush for Balance
    @Composable
    fun balanceBrush(isPositive: Boolean) = if (isPositive) {
        Brush.verticalGradient(colors = listOf(Color(0xFF6EE7B7), emerald()))
    } else {
        Brush.verticalGradient(colors = listOf(Color(0xFFFDA4AF), crimson()))
    }

    @Composable
    fun labelStyle() = sectionLabelStyle()
}

@Composable
fun FinanceSummaryCard(
    expenseTotal: Double,
    incomeTotal: Double,
    net: Double,
    currencyCode: String,
    periodLabel: String = "all time",
    animateChanges: Boolean = true,
    modifier: Modifier = Modifier
) {
    // Pillar 2: True Glassmorphism Container with "Hyper-Obsidian" Specular Depth
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .appGlassCard(shape = RoundedCornerShape(24.dp))
            .glassShine()
            .padding(vertical = 32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.summary_balance_period, periodLabel).uppercase(),
                style = AuroraTokens.labelStyle(),
            )
            
            Spacer(modifier = Modifier.height(12.dp))

            // Pillar 3: Dynamic Radiant Typography
            Text(
                text = CurrencyUtils.formatAmount(net, currencyCode),
                style = TextStyle(
                    brush = AuroraTokens.balanceBrush(net >= 0),
                    fontSize = 52.sp,
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum",
                    shadow = Shadow(
                        color = (if (net >= 0) AuroraTokens.emerald() else AuroraTokens.crimson()).copy(alpha = 0.25f),
                        blurRadius = 24f,
                        offset = Offset(0f, 4f)
                    )
                )
            )

            Spacer(modifier = Modifier.height(32.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SummaryPane(
                    label = stringResource(R.string.summary_earned),
                    value = CurrencyUtils.formatAmount(incomeTotal, currencyCode),
                    color = AuroraTokens.emerald(),
                    isIncome = true,
                    modifier = Modifier.weight(1f)
                )

                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                )

                SummaryPane(
                    label = stringResource(R.string.summary_spent),
                    value = CurrencyUtils.formatAmount(expenseTotal, currencyCode),
                    color = AuroraTokens.crimson(),
                    isIncome = false,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun SummaryPane(
    label: String,
    value: String,
    color: Color,
    isIncome: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Prominent Arrow Badge
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = if (isIncome) Icons.Rounded.ArrowUpward else Icons.Rounded.ArrowDownward,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(16.dp)
            )
        }
        
        Spacer(Modifier.height(8.dp))
        
        Text(
            text = label.uppercase(),
            style = AuroraTokens.labelStyle(),
        )
        
        Spacer(modifier = Modifier.height(4.dp))
        
        // Pillar 3: Amount text pop with colored drop shadow
        Text(
            text = value,
            style = TextStyle(
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                fontFeatureSettings = "tnum"
            )
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Refined Physical Mark - Law 4: Symmetrical anchors
        Box(
            modifier = Modifier
                .width(32.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.6f))
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
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(32.dp))
            AppButton(
                onClick = onAction,
                text = actionLabel.uppercase(),
            )
        }
    }
}

@Composable
private fun AppButton(
    onClick: () -> Unit,
    text: String,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onBackground)
            .premiumClickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = TextStyle(
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                color = MaterialTheme.colorScheme.background
            )
        )
    }
}
