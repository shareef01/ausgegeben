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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
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
import com.aus.ausgegeben.util.CashFlowPoint
import kotlin.math.hypot

@Composable
fun WealthTrendChart(
    points: List<CashFlowPoint>,
    currencyCode: String,
    modifier: Modifier = Modifier,
) {
    if (points.isEmpty()) return

    val incomeColor = financeIncomeColor()
    val expenseColor = financeExpenseColor()
    val totalIncome = points.sumOf { it.income }
    val totalExpense = points.sumOf { it.expense }
    val animationKey = remember(points) { points.map { it.bucketStartMillis }.hashCode() }

    val reveal = remember { Animatable(0f) }
    LaunchedEffect(animationKey) {
        reveal.snapTo(0f)
        reveal.animateTo(1f, AppChartRevealSpring)
    }

    val cardShape = RoundedCornerShape(AppRadius.lg)
    val dividerColor = appDividerColor()
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
                    text = stringResource(R.string.chart_cash_flow_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                FlowLegend(incomeColor = incomeColor, expenseColor = expenseColor)
            }
            Text(
                text = stringResource(
                    R.string.chart_cash_flow_subtitle,
                    CurrencyUtils.formatAmount(totalIncome, currencyCode, showSymbol = true),
                    CurrencyUtils.formatAmount(totalExpense, currencyCode, showSymbol = true),
                ),
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

            val values = points.flatMap { listOf(it.income, it.expense) }
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

            val incomeCoords = points.indices.map { i -> Offset(xFor(i), yFor(points[i].income)) }
            val expenseCoords = points.indices.map { i -> Offset(xFor(i), yFor(points[i].expense)) }

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
            drawCashFlowLine(
                coords = incomeCoords,
                fraction = revealT,
                color = incomeColor,
                bottomY = padY + chartH,
            )
            drawCashFlowLine(
                coords = expenseCoords,
                fraction = revealT,
                color = expenseColor,
                bottomY = padY + chartH,
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
private fun FlowLegend(incomeColor: androidx.compose.ui.graphics.Color, expenseColor: androidx.compose.ui.graphics.Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.xs),
    ) {
        LegendDot(incomeColor)
        LegendDot(expenseColor)
    }
}

@Composable
private fun LegendDot(color: androidx.compose.ui.graphics.Color) {
    Box(
        modifier = Modifier
            .size(9.dp)
            .clip(CircleShape)
            .background(color)
    )
}

private fun DrawScope.drawCashFlowLine(
    coords: List<Offset>,
    fraction: Float,
    color: androidx.compose.ui.graphics.Color,
    bottomY: Float,
) {
    val partial = buildPartialPolyline(coords, fraction.coerceIn(0f, 1f))
    if (partial.isEmpty()) return

    val areaPath = Path().apply {
        moveTo(partial.first().x, partial.first().y)
        partial.drop(1).forEach { lineTo(it.x, it.y) }
        lineTo(partial.last().x, bottomY)
        lineTo(partial.first().x, bottomY)
        close()
    }
    drawPath(
        path = areaPath,
        brush = Brush.verticalGradient(
            colors = listOf(color.copy(alpha = 0.24f * fraction), color.copy(alpha = 0.025f)),
            startY = 0f,
            endY = bottomY,
        ),
    )

    val linePath = Path().apply {
        moveTo(partial.first().x, partial.first().y)
        partial.drop(1).forEach { lineTo(it.x, it.y) }
    }
    drawPath(
        path = linePath,
        color = color.copy(alpha = 0.22f * fraction),
        style = Stroke(width = 8.dp.toPx(), cap = StrokeCap.Round),
    )
    drawPath(
        path = linePath,
        color = color.copy(alpha = fraction),
        style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
    )
    val endpoint = partial.last()
    drawCircle(color = color.copy(alpha = 0.28f * fraction), radius = 9.dp.toPx() * fraction, center = endpoint)
    drawCircle(color = color.copy(alpha = fraction), radius = 4.dp.toPx() * fraction, center = endpoint)
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
