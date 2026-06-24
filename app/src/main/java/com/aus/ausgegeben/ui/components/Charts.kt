package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AmountTextStyle
import com.aus.ausgegeben.ui.theme.AppChartSpring
import com.aus.ausgegeben.ui.theme.chartColorAt
import com.aus.ausgegeben.ui.theme.chartHighlight
import com.aus.ausgegeben.ui.theme.chartShadow
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.util.CurrencyUtils

@Composable
fun DonutChart(
    data: Map<String, Double>,
    modifier: Modifier = Modifier,
    colors: Map<String, Color> = emptyMap(),
    centerLabel: String? = null,
    centerSubLabel: String? = null,
    chartSize: Dp = 212.dp
) {
    val total = data.values.sum()
    val sorted = data.entries.sortedByDescending { it.value }
    val colorScheme = MaterialTheme.colorScheme
    val trackColor = colorScheme.outlineVariant.copy(alpha = 0.35f)
    val holeColor = colorScheme.surface
    val holeRing = colorScheme.outline.copy(alpha = 0.12f)
    val shadowColor = Color.Black.copy(alpha = if (colorScheme.background.luminance() < 0.5f) 0.28f else 0.08f)

    val chartDescription = if (total <= 0.0) {
        "No chart data"
    } else {
        buildString {
            append("Breakdown by category, total ")
            append(centerLabel ?: CurrencyUtils.formatAmount(total, "EUR"))
        }
    }

    val progress by animateFloatAsState(
        targetValue = if (total > 0.0) 1f else 0f,
        animationSpec = AppChartSpring,
        label = "donutProgress"
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = chartDescription },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (sorted.isNotEmpty() && total > 0.0) {
            ChartSegmentBar(
                segments = sorted.mapIndexed { index, (_, value) ->
                    val name = sorted[index].key
                    val color = colors[name]?.forChartDisplay(index)
                        ?: chartColorAt(index)
                    color to (value / total).toFloat()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp, vertical = 8.dp)
            )
        }

        Box(
            modifier = Modifier
                .defaultMinSize(minHeight = chartSize + 24.dp)
                .height(chartSize + 24.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(chartSize)) {
                val strokeWidth = size.minDimension * 0.095f
                val arcSize = size.minDimension - strokeWidth * 2f
                val arcTopLeft = Offset(strokeWidth, strokeWidth)
                val arcBoxSize = Size(arcSize, arcSize)

                // Soft drop shadow ring
                drawArc(
                    color = shadowColor,
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = strokeWidth * 1.35f, cap = StrokeCap.Round),
                    size = arcBoxSize,
                    topLeft = Offset(arcTopLeft.x, arcTopLeft.y + 3f)
                )

                drawArc(
                    color = trackColor,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                    size = arcBoxSize,
                    topLeft = arcTopLeft
                )

                if (total > 0.0) {
                    var startAngle = -90f
                    val gapDegrees = if (sorted.size > 1) 4.5f else 0f

                    sorted.forEachIndexed { index, (name, value) ->
                        val fullSweep =
                            ((value / total).toFloat() * 360f - gapDegrees).coerceAtLeast(0.8f)
                        val sweep = fullSweep * progress
                        val base = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)
                        val segmentBrush = Brush.sweepGradient(
                            0f to base.chartShadow(),
                            0.45f to base,
                            1f to base.chartHighlight(),
                            center = center
                        )

                        drawArc(
                            brush = segmentBrush,
                            startAngle = startAngle + gapDegrees / 2f,
                            sweepAngle = sweep,
                            useCenter = false,
                            style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                            size = arcBoxSize,
                            topLeft = arcTopLeft
                        )
                        startAngle += fullSweep + gapDegrees
                    }
                }

                val holeRadius = (size.minDimension / 2f) - strokeWidth * 1.35f
                drawCircle(color = holeColor, radius = holeRadius, center = center)
                drawCircle(
                    color = holeRing,
                    radius = holeRadius,
                    center = center,
                    style = Stroke(width = 1.5f)
                )
            }

            if (centerLabel != null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 24.dp)
                ) {
                    Text(
                        text = centerLabel,
                        style = MaterialTheme.typography.headlineSmall.merge(AmountTextStyle),
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                    if (centerSubLabel != null) {
                        Text(
                            text = centerSubLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChartSegmentBar(
    segments: List<Pair<Color, Float>>,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(4.dp)
    Row(
        modifier = modifier
            .height(6.dp)
            .clip(shape)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.25f))
    ) {
        segments.forEach { (color, weight) ->
            if (weight > 0f) {
                Box(
                    modifier = Modifier
                        .weight(weight.coerceAtLeast(0.01f))
                        .fillMaxHeight()
                        .background(color)
                )
            }
        }
    }
}

@Composable
fun AnimatedCategoryBar(
    ratio: Float,
    color: Color,
    modifier: Modifier = Modifier
) {
    val displayColor = color.forChartDisplay(0)
    val animatedRatio by animateFloatAsState(
        targetValue = ratio.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
        label = "barFill"
    )
    val trackShape = RoundedCornerShape(5.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(5.dp)
            .clip(trackShape)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.28f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedRatio)
                .height(5.dp)
                .clip(trackShape)
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            displayColor.chartShadow(),
                            displayColor,
                            displayColor.chartHighlight()
                        )
                    )
                )
        )
    }
}
