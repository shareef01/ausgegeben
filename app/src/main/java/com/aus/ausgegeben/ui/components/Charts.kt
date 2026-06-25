package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.components.MoneyText
import com.aus.ausgegeben.ui.components.MoneySize
import com.aus.ausgegeben.ui.theme.chartColorAt
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.util.CurrencyUtils

@Composable
fun DonutChart(
    data: Map<String, Double>,
    modifier: Modifier = Modifier,
    colors: Map<String, Color> = emptyMap(),
    centerLabel: String? = null,
    centerSubLabel: String? = null,
    chartSize: Dp = 200.dp
) {
    val total = data.values.sum()
    val sorted = data.entries.sortedByDescending { it.value }
    val colorScheme = MaterialTheme.colorScheme
    val trackColor = colorScheme.outlineVariant.copy(alpha = 0.4f)
    val holeColor = colorScheme.surface

    val chartDescription = if (total <= 0.0) {
        stringResource(R.string.chart_no_data)
    } else {
        stringResource(
            R.string.chart_breakdown_description,
            centerLabel ?: CurrencyUtils.formatAmount(total, "EUR")
        )
    }

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
                    val color = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)
                    color to (value / total).toFloat()
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp, vertical = 8.dp)
            )
        }

        Box(
            modifier = Modifier
                .defaultMinSize(minHeight = chartSize + 16.dp)
                .height(chartSize + 16.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(chartSize)) {
                val strokeWidth = size.minDimension * 0.09f
                val arcSize = size.minDimension - strokeWidth * 2f
                val arcTopLeft = Offset(strokeWidth, strokeWidth)
                val arcBoxSize = Size(arcSize, arcSize)

                drawArc(
                    color = trackColor,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                    size = arcBoxSize,
                    topLeft = arcTopLeft
                )

                if (total > 0.0) {
                    var startAngle = -90f
                    val gapDegrees = if (sorted.size > 1) 3f else 0f

                    sorted.forEachIndexed { index, (name, value) ->
                        val fullSweep =
                            ((value / total).toFloat() * 360f - gapDegrees).coerceAtLeast(0.8f)
                        val base = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)

                        drawArc(
                            color = base,
                            startAngle = startAngle + gapDegrees / 2f,
                            sweepAngle = fullSweep,
                            useCenter = false,
                            style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                            size = arcBoxSize,
                            topLeft = arcTopLeft
                        )
                        startAngle += fullSweep + gapDegrees
                    }
                }

                val holeRadius = (size.minDimension / 2f) - strokeWidth * 1.2f
                drawCircle(color = holeColor, radius = holeRadius, center = center)
            }

            if (centerLabel != null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = 24.dp)
                ) {
                    MoneyText(
                        text = centerLabel,
                        size = MoneySize.Headline,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(horizontal = 4.dp)
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
            .height(5.dp)
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
        animationSpec = tween(durationMillis = 250),
        label = "barFill"
    )
    val trackShape = RoundedCornerShape(4.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(trackShape)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.28f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedRatio)
                .height(4.dp)
                .clip(trackShape)
                .background(displayColor)
        )
    }
}
