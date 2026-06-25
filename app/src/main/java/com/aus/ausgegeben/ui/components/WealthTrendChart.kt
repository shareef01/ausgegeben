package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
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
    val trendColor = if (isPositive) AppColors.Income else AppColors.Expense
    val animationKey = remember(points) { points.map { it.bucketStartMillis }.hashCode() }

    val reveal = remember { Animatable(0f) }
    LaunchedEffect(animationKey) {
        reveal.snapTo(0f)
        reveal.animateTo(1f, AppChartRevealSpring)
    }

    val pulse by rememberInfiniteTransition(label = "wealthPulse").animateFloat(
        initialValue = 0.82f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )

    val cardShape = RoundedCornerShape(AppRadius.lg)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .clip(cardShape)
            .appCard(shape = cardShape)
            .padding(AppSpacing.md),
        verticalArrangement = Arrangement.spacedBy(AppSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.chart_wealth_trend_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = AppColors.OnBackground,
                )
                Text(
                    text = stringResource(R.string.chart_wealth_trend_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = AppColors.OnSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                MoneyText(
                    text = CurrencyUtils.formatAmount(latest.cumulativeNet, currencyCode, showSymbol = true),
                    size = MoneySize.Title,
                    color = if (latest.cumulativeNet >= 0) AppColors.Income else AppColors.Expense,
                )
                Text(
                    text = stringResource(
                        if (isPositive) R.string.chart_wealth_trend_delta_up
                        else R.string.chart_wealth_trend_delta_down,
                        CurrencyUtils.formatAmount(abs(delta), currencyCode, showSymbol = true),
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = trendColor,
                )
            }
        }

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(148.dp),
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
            val zeroY = yFor(0.0).coerceIn(padY, padY + chartH)

            drawLine(
                color = AppColors.CardBorder,
                start = Offset(padX, zeroY),
                end = Offset(padX + chartW, zeroY),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f)),
            )

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

            val gradientTop = trendColor.copy(alpha = (if (isPositive) 0.32f else 0.24f) * revealT)
            val gradientBottom = trendColor.copy(alpha = 0.02f)

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
                color = trendColor.copy(alpha = 0.22f * revealT),
                style = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round),
            )
            drawPath(
                path = linePath,
                color = trendColor.copy(alpha = revealT),
                style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round),
            )

            val endpoint = partial.last()
            val dotR = 5.dp.toPx() * pulse * revealT
            drawCircle(
                color = trendColor.copy(alpha = 0.35f * revealT),
                radius = dotR * 2.2f,
                center = endpoint,
            )
            drawCircle(
                color = trendColor.copy(alpha = revealT),
                radius = dotR,
                center = endpoint,
            )
            drawCircle(
                color = AppColors.CardSurface,
                radius = dotR * 0.45f,
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
                color = AppColors.OnSurfaceVariant,
            )
            Text(
                text = points.last().label,
                style = MaterialTheme.typography.labelSmall,
                color = AppColors.OnSurfaceVariant,
            )
        }
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
