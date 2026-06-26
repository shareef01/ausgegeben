package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppChartRevealSpring
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.ChartStrokeWidth
import com.aus.ausgegeben.ui.theme.appDividerColor
import com.aus.ausgegeben.ui.theme.chartColorAt
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.ui.theme.forChartDisplay
import com.aus.ausgegeben.util.CurrencyUtils

private val DONUT_STROKE = ChartStrokeWidth

@Composable
fun IncomeExpenseOverviewChart(
    expenseTotal: Double,
    incomeTotal: Double,
    currencyCode: String,
    modifier: Modifier = Modifier
) {
    val combined = expenseTotal + incomeTotal
    if (combined <= 0.0) return

    val expenseRatio = (expenseTotal / combined).toFloat()
    val incomeRatio = (incomeTotal / combined).toFloat()
    val net = incomeTotal - expenseTotal
    val animationKey = expenseTotal to incomeTotal
    val progress = remember { Animatable(0f) }

    LaunchedEffect(animationKey) {
        progress.snapTo(0f)
        progress.animateTo(1f, AppChartRevealSpring)
    }

    val cardShape = RoundedCornerShape(AppRadius.lg)
    val chartSurface = MaterialTheme.colorScheme.surface
    val onSurfaceVariant = MaterialTheme.colorScheme.onSurfaceVariant
    val onBackground = MaterialTheme.colorScheme.onBackground
    val chartTrack = appDividerColor().copy(alpha = 0.55f)
    val expenseColor = financeExpenseColor()
    val incomeColor = financeIncomeColor()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .clip(cardShape)
            .appCard(shape = cardShape)
            .padding(vertical = AppSpacing.md)
    ) {
        Text(
            text = stringResource(R.string.chart_overview_title),
            style = MaterialTheme.typography.titleSmall,
            color = onBackground,
            fontWeight = FontWeight.Normal,
            modifier = Modifier
                .padding(horizontal = AppSpacing.md)
                .padding(bottom = AppSpacing.sm)
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(176.dp),
            contentAlignment = Alignment.Center
        ) {
            val chartSize = 160.dp
            Canvas(modifier = Modifier.size(chartSize)) {
                val strokePx = DONUT_STROKE.toPx()
                val arcSize = size.minDimension - strokePx * 2f
                val arcTopLeft = Offset(strokePx, strokePx)
                val arcBoxSize = Size(arcSize, arcSize)
                val gap = 3f
                val reveal = progress.value

                drawArc(
                    color = chartTrack,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    style = Stroke(width = strokePx, cap = StrokeCap.Round),
                    size = arcBoxSize,
                    topLeft = arcTopLeft
                )

                val expenseSweep = ((expenseRatio * 360f) - gap).coerceAtLeast(0.5f) * reveal
                if (expenseSweep > 0f) {
                    drawArc(
                        color = expenseColor.copy(alpha = 0.20f * reveal),
                        startAngle = -90f + gap / 2f,
                        sweepAngle = expenseSweep,
                        useCenter = false,
                        style = Stroke(width = strokePx * 1.7f, cap = StrokeCap.Round),
                        size = arcBoxSize,
                        topLeft = arcTopLeft
                    )
                    drawArc(
                        color = expenseColor,
                        startAngle = -90f + gap / 2f,
                        sweepAngle = expenseSweep,
                        useCenter = false,
                        style = Stroke(width = strokePx, cap = StrokeCap.Round),
                        size = arcBoxSize,
                        topLeft = arcTopLeft
                    )
                }

                val incomeSweep = ((incomeRatio * 360f) - gap).coerceAtLeast(0.5f) * reveal
                if (incomeSweep > 0f) {
                    val incomeStart = -90f + expenseRatio * 360f * reveal + gap / 2f
                    drawArc(
                        color = incomeColor.copy(alpha = 0.22f * reveal),
                        startAngle = incomeStart,
                        sweepAngle = incomeSweep,
                        useCenter = false,
                        style = Stroke(width = strokePx * 1.7f, cap = StrokeCap.Round),
                        size = arcBoxSize,
                        topLeft = arcTopLeft
                    )
                    drawArc(
                        color = incomeColor,
                        startAngle = incomeStart,
                        sweepAngle = incomeSweep,
                        useCenter = false,
                        style = Stroke(width = strokePx, cap = StrokeCap.Round),
                        size = arcBoxSize,
                        topLeft = arcTopLeft
                    )
                }

                val holeRadius = (size.minDimension / 2f) - strokePx * 1.5f
                drawCircle(color = chartSurface, radius = holeRadius, center = center)
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .scale(0.88f + 0.12f * progress.value)
                    .alpha(((progress.value - 0.2f) / 0.8f).coerceIn(0f, 1f))
            ) {
                MoneyText(
                    text = CurrencyUtils.formatAmount(net, currencyCode),
                    size = MoneySize.Headline,
                    color = when {
                        net > 0 -> incomeColor
                        net < 0 -> expenseColor
                        else -> onBackground
                    }
                )
                Text(
                    text = stringResource(R.string.chart_net_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppSpacing.md),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            OverviewLegendItem(
                color = expenseColor,
                label = stringResource(R.string.summary_spent),
                value = CurrencyUtils.formatAmount(expenseTotal, currencyCode),
                percent = (expenseRatio * 100).toInt(),
                reveal = progress.value,
                stagger = 0.1f,
            )
            OverviewLegendItem(
                color = incomeColor,
                label = stringResource(R.string.summary_earned),
                value = CurrencyUtils.formatAmount(incomeTotal, currencyCode),
                percent = (incomeRatio * 100).toInt(),
                reveal = progress.value,
                stagger = 0.25f,
            )
        }
    }
}

@Composable
private fun OverviewLegendItem(
    color: Color,
    label: String,
    value: String,
    percent: Int,
    reveal: Float = 1f,
    stagger: Float = 0f,
) {
    val itemAlpha = ((reveal - stagger) / (1f - stagger)).coerceIn(0f, 1f)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.alpha(itemAlpha),
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color)
        )
        Spacer(modifier = Modifier.width(AppSpacing.xs))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Normal
            )
            MoneyText(text = value, size = MoneySize.Body, color = color)
            Text(
                text = "$percent%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
        }
    }
}

@Composable
fun DonutChart(
    data: Map<String, Double>,
    modifier: Modifier = Modifier,
    colors: Map<String, Color> = emptyMap(),
    centerLabel: String? = null,
    centerSubLabel: String? = null,
    chartSize: Dp = 148.dp,
    compact: Boolean = false,
    currencyCode: String = "EUR",
) {
    val total = data.values.sum()
    val sorted = data.entries.sortedByDescending { it.value }
    val trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.18f)
    val holeColor = MaterialTheme.colorScheme.surface
    val animationKey = remember(data) { data.entries.sortedBy { it.key }.hashCode() }
    val progress = remember { Animatable(0f) }

    LaunchedEffect(animationKey) {
        progress.snapTo(0f)
        progress.animateTo(1f, AppChartRevealSpring)
    }

    val chartDescription = if (total <= 0.0) {
        stringResource(R.string.chart_no_data)
    } else {
        stringResource(
            R.string.chart_breakdown_description,
            centerLabel ?: CurrencyUtils.formatAmount(total, currencyCode)
        )
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = chartDescription },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (!compact && sorted.isNotEmpty() && total > 0.0) {
            AnimatedChartSegmentBar(
                segments = sorted.mapIndexed { index, (_, value) ->
                    val name = sorted[index].key
                    val color = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)
                    color to (value / total).toFloat()
                },
                progress = progress.value,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            )
        }

        Box(
            modifier = Modifier
                .defaultMinSize(minHeight = chartSize + if (compact) AppSpacing.xs else AppSpacing.md)
                .height(chartSize + if (compact) AppSpacing.xs else AppSpacing.md),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size(chartSize)) {
                val strokePx = DONUT_STROKE.toPx()
                val arcSize = size.minDimension - strokePx * 2f
                val arcTopLeft = Offset(strokePx, strokePx)
                val arcBoxSize = Size(arcSize, arcSize)
                val reveal = progress.value

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
                        val segmentReveal = ((reveal * sorted.size) - index).coerceIn(0f, 1f)
                        val base = colors[name]?.forChartDisplay(index) ?: chartColorAt(index)
                        val easedReveal = segmentReveal * segmentReveal * (3f - 2f * segmentReveal)
                        val sweep = fullSweep * easedReveal
                        if (sweep <= 0f) return@forEachIndexed

                        drawArc(
                            color = base.copy(alpha = 0.20f * easedReveal),
                            startAngle = startAngle + gapDegrees / 2f,
                            sweepAngle = sweep,
                            useCenter = false,
                            style = Stroke(width = strokePx * 1.75f, cap = StrokeCap.Round),
                            size = arcBoxSize,
                            topLeft = arcTopLeft
                        )
                        drawArc(
                            color = base,
                            startAngle = startAngle + gapDegrees / 2f,
                            sweepAngle = sweep,
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
                    modifier = Modifier
                        .padding(horizontal = AppSpacing.sm)
                        .scale(0.9f + 0.1f * progress.value)
                        .alpha(((progress.value - 0.15f) / 0.85f).coerceIn(0f, 1f))
                ) {
                    MoneyText(
                        text = centerLabel,
                        size = if (compact) MoneySize.Title else MoneySize.Headline,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(horizontal = AppSpacing.xxs)
                    )
                    if (centerSubLabel != null) {
                        Text(
                            text = centerSubLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AnimatedChartSegmentBar(
    segments: List<Pair<Color, Float>>,
    progress: Float,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(AppRadius.pill)
    Row(
        modifier = modifier
            .height(7.dp)
            .clip(shape)
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.18f))
    ) {
        segments.forEach { (color, weight) ->
            if (weight > 0f) {
                Box(
                    modifier = Modifier
                        .weight(weight.coerceAtLeast(0.01f))
                        .fillMaxHeight()
                        .background(color.copy(alpha = color.alpha * progress.coerceIn(0f, 1f)))
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
        animationSpec = AppChartRevealSpring,
        label = "barFill"
    )
    val trackShape = RoundedCornerShape(AppRadius.pill)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(trackShape)
            .background(displayColor.copy(alpha = 0.12f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(animatedRatio)
                .height(6.dp)
                .clip(trackShape)
                .background(displayColor)
        )
    }
}
