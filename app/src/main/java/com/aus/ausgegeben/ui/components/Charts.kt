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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.ChartStrokeWidth
import com.aus.ausgegeben.ui.theme.chartColorAt
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.util.CurrencyUtils

private val DONUT_STROKE = ChartStrokeWidth

@Composable
fun DonutChart(
    data: Map<String, Double>,
    modifier: Modifier = Modifier,
    colors: Map<String, Color> = emptyMap(),
    centerLabel: String? = null,
    centerSubLabel: String? = null,
    chartSize: Dp = 148.dp
) {
    val total = data.values.sum()
    val sorted = data.entries.sortedByDescending { it.value }
    val trackColor = AppColors.Expense.copy(alpha = 0.08f)
    val holeColor = AppColors.CardSurface

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
                    .padding(horizontal = AppSpacing.lg, vertical = AppSpacing.xs)
            )
        }

        Box(
            modifier = Modifier
                .defaultMinSize(minHeight = chartSize + AppSpacing.md)
                .height(chartSize + AppSpacing.md),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(chartSize)) {
                val strokePx = DONUT_STROKE.toPx()
                val arcSize = size.minDimension - strokePx * 2f
                val arcTopLeft = Offset(strokePx, strokePx)
                val arcBoxSize = Size(arcSize, arcSize)

                drawArc(
                    color = trackColor,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = strokePx, cap = StrokeCap.Round),
                    size = arcBoxSize,
                    topLeft = arcTopLeft
                )

                if (total > 0.0) {
                    var startAngle = -90f
                    val gapDegrees = if (sorted.size > 1) 2f else 0f

                    sorted.forEachIndexed { index, (name, value) ->
                        val fullSweep =
                            ((value / total).toFloat() * 360f - gapDegrees).coerceAtLeast(0.5f)
                        val base = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)

                        drawArc(
                            color = base,
                            startAngle = startAngle + gapDegrees / 2f,
                            sweepAngle = fullSweep,
                            useCenter = false,
                            style = Stroke(width = strokePx, cap = StrokeCap.Round),
                            size = arcBoxSize,
                            topLeft = arcTopLeft
                        )
                        startAngle += fullSweep + gapDegrees
                    }
                }

                val holeRadius = (size.minDimension / 2f) - strokePx * 1.5f
                drawCircle(color = holeColor, radius = holeRadius, center = center)
            }

            if (centerLabel != null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(horizontal = AppSpacing.lg)
                ) {
                    MoneyText(
                        text = centerLabel,
                        size = MoneySize.Headline,
                        color = AppColors.OnBackground,
                        modifier = Modifier.padding(horizontal = AppSpacing.xxs)
                    )
                    if (centerSubLabel != null) {
                        Text(
                            text = centerSubLabel.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = AppColors.OnSurfaceVariant,
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
    val shape = RoundedCornerShape(3.dp)
    Row(
        modifier = modifier
            .height(4.dp)
            .clip(shape)
            .background(AppColors.Expense.copy(alpha = 0.08f))
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
        animationSpec = tween(durationMillis = 300),
        label = "barFill"
    )
    val trackShape = RoundedCornerShape(3.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(3.dp)
            .clip(trackShape)
            .background(displayColor.copy(alpha = 0.1f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedRatio)
                .height(3.dp)
                .clip(trackShape)
                .background(displayColor)
        )
    }
}
