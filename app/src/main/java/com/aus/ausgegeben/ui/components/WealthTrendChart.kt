package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppChartRevealSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.appDividerColor
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.WealthTrendPoint
import kotlin.math.abs
import kotlin.math.hypot

@Composable
fun WealthTrendChart(
    points: List<WealthTrendPoint>,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    if (points.isEmpty()) return

    val latest = points.last()
    val start = points.first().cumulativeNet
    val delta = latest.cumulativeNet - start
    val isPositive = delta >= 0
    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val trendColor = if (isPositive) incomeColor else expenseColor
    val animationKey = remember(points) { points.map { it.bucketStartMillis }.hashCode() }

    val reveal = remember { Animatable(0f) }
    LaunchedEffect(animationKey) {
        reveal.snapTo(0f)
        reveal.animateTo(1f, AppChartRevealSpring)
    }

    val cardShape = RoundedCornerShape(AppRadius.lg)
    val dividerColor = appDividerColor()
    val chartSurfaceColor = MaterialTheme.colorScheme.surface
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .clip(cardShape)
            .appCard(shape = cardShape)
            .padding(AppSpacing.md),
        verticalArrangement = Arrangement.spacedBy(AppSpacing.sm),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.xs)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.chart_wealth_trend_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                TrendDeltaPill(
                    text = stringResource(
                        if (isPositive) R.string.chart_wealth_trend_delta_up
                        else R.string.chart_wealth_trend_delta_down,
                        CurrencyUtils.formatAmount(abs(delta), currencyCode, showSymbol = true),
                    ),
                    color = trendColor,
                )
            }
            MoneyText(
                text = CurrencyUtils.formatAmount(latest.cumulativeNet, currencyCode, showSymbol = true),
                size = MoneySize.Headline,
                color = if (latest.cumulativeNet >= 0) incomeColor else expenseColor,
                animateChanges = true,
            )
            Text(
                text = stringResource(R.string.chart_wealth_trend_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(136.dp),
        ) {
            val w = size.width
            val h = size.height
            val padX = 8.dp.toPx()
            val padY = 16.dp.toPx()
            val chartW = w - padX * 2
            val chartH = h - padY * 2

            val values = points.map { it.cumulativeNet }
            val minV = values.min()
            val maxV = values.max()
            val range = (maxV - minV).coerceAtLeast(1.0)

            fun yFor(v: Double): Float {
                val t = ((v - minV) / range).toFloat()
                return padY + chartH * (1f - t)
            }

            fun xFor(i: Int): Float {
                if (points.size == 1) return padX + chartW / 2f
                return padX + (i.toFloat() / (points.size - 1)) * chartW
            }

            val coords = points.indices.map { i -> Offset(xFor(i), yFor(points[i].cumulativeNet)) }
            val chartBottom = padY + chartH
            val zeroInRange = minV <= 0.0 && maxV >= 0.0
            val zeroY = if (zeroInRange) yFor(0.0).coerceIn(padY, chartBottom) else null

            if (zeroY != null) {
                drawLine(
                    color = dividerColor.copy(alpha = 0.7f),
                    start = Offset(padX, zeroY),
                    end = Offset(padX + chartW, zeroY),
                    strokeWidth = 1.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f)),
                )
            }

            repeat(3) { index ->
                val y = padY + chartH * ((index + 1) / 4f)
                drawLine(
                    color = dividerColor.copy(alpha = 0.22f * reveal.value.coerceIn(0f, 1f)),
                    start = Offset(padX, y),
                    end = Offset(padX + chartW, y),
                    strokeWidth = 1.dp.toPx(),
                )
            }

            val revealT = reveal.value.coerceIn(0f, 1f)
            val partial = buildPartialPolyline(coords, revealT)
            if (partial.isEmpty()) return@Canvas

            val areaPath = Path().apply {
                moveTo(partial.first().x, partial.first().y)
                partial.drop(1).forEach { lineTo(it.x, it.y) }
                lineTo(partial.last().x, padY + chartH)
                lineTo(partial.first().x, padY + chartH)
                close()
            }

            val gradientTop = trendColor.copy(alpha = (if (isPositive) 0.46f else 0.36f) * revealT)
            val gradientBottom = trendColor.copy(alpha = 0.035f)

            drawPath(
                path = areaPath,
                brush = Brush.verticalGradient(
                    colors = listOf(gradientTop, gradientBottom),
                    startY = padY,
                    endY = padY + chartH,
                ),
            )

            val linePath = Path().apply {
                moveTo(partial.first().x, partial.first().y)
                partial.drop(1).forEach { lineTo(it.x, it.y) }
            }

            drawPath(
                path = linePath,
                color = trendColor.copy(alpha = 0.26f * revealT),
                style = Stroke(width = 9.dp.toPx(), cap = StrokeCap.Round),
            )
            drawPath(
                path = linePath,
                color = trendColor.copy(alpha = revealT),
                style = Stroke(width = 3.25.dp.toPx(), cap = StrokeCap.Round),
            )

            val endpoint = partial.last()
            val dotR = 5.dp.toPx() * revealT
            drawCircle(
                color = trendColor.copy(alpha = 0.3f * revealT),
                radius = dotR * 2f,
                center = endpoint,
            )
            drawCircle(
                color = trendColor.copy(alpha = revealT),
                radius = dotR,
                center = endpoint,
            )
            drawCircle(
                color = chartSurfaceColor,
                radius = dotR * 0.4f,
                center = endpoint,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = points.first().label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = points.last().label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TrendDeltaPill(text: String, color: androidx.compose.ui.graphics.Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(AppRadius.pill))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = AppSpacing.xs, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(color)
        )
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun buildPartialPolyline(coords: List<Offset>, fraction: Float): List<Offset> {
    if (coords.isEmpty()) return emptyList()
    if (coords.size == 1 || fraction <= 0f) return listOf(coords.first())
    if (fraction >= 1f) return coords

    val segmentLengths = coords.zipWithNext { a, b -> hypot((b.x - a.x).toDouble(), (b.y - a.y).toDouble()) }
    val totalLength = segmentLengths.sum()
    if (totalLength <= 0.0) return coords

    val target = totalLength * fraction
    var walked = 0.0
    val result = mutableListOf(coords.first())

    for (i in segmentLengths.indices) {
        val segLen = segmentLengths[i]
        if (walked + segLen >= target) {
            val t = ((target - walked) / segLen).toFloat().coerceIn(0f, 1f)
            val a = coords[i]
            val b = coords[i + 1]
            result += Offset(
                x = a.x + (b.x - a.x) * t,
                y = a.y + (b.y - a.y) * t,
            )
            return result
        }
        walked += segLen
        result += coords[i + 1]
    }
    return coords
}
