package com.aus.ausgegeben.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.IntrinsicMeasurable
import androidx.compose.ui.layout.IntrinsicMeasureScope
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Text that never truncates. It stays on one line at [style]'s size when it fits, steps
 * the size down towards [minFontSize] when it does not, and wraps if even that is too
 * wide. Use it for amounts and short labels in fixed-width slots: "1.104.064,…" is a
 * wrong number, and "NET BALAN…" an unreadable label.
 *
 * The size is worked out from the slot's measured width with a text measurer, and the
 * text is not drawn until it matches, so there is no shrinking flash; it grows back when
 * the slot widens. It used to shrink half a point per frame from onTextLayout, then
 * ellipsise at the minimum. A plain Layout rather than BoxWithConstraints, so it can sit
 * in rows sized with IntrinsicSize (the summary card's is).
 */
@Composable
fun AutoScalingText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    minFontSize: TextUnit = 8.5.sp,
    color: Color = Color.Unspecified,
    textAlign: TextAlign = TextAlign.Center,
) {
    val measurer = rememberTextMeasurer()
    val merged = LocalTextStyle.current.merge(style)
    var slotWidth by remember { mutableIntStateOf(UNMEASURED) }
    val fittedFor = slotWidth
    val (fitted, shown) = remember(text, merged, fittedFor, minFontSize) {
        if (fittedFor == UNMEASURED || fittedFor == Constraints.Infinity) {
            merged to text
        } else {
            val widthAt = { s: TextStyle -> measurer.measure(text, s, softWrap = false, maxLines = 1).size.width }
            val style = fitOnOneLine(text, merged, fittedFor, minFontSize, widthAt)
            // Still too wide at the minimum: it has to wrap. Let an amount break only after
            // a group separator ("1.104.064,|70"), never between two digits.
            style to if (widthAt(style) > fittedFor) breakAfterGroupSeparators(text) else text
        }
    }
    val policy = remember(textAlign) {
        FittedTextPolicy(textAlign) { width -> if (width != slotWidth) slotWidth = width }
    }
    Layout(
        content = { Text(text = shown, style = fitted, color = color, textAlign = textAlign) },
        modifier = modifier.drawWithContent { if (fittedFor == slotWidth) drawContent() },
        measurePolicy = policy,
    )
}

private const val UNMEASURED = -1

/**
 * Reports the slot width so the text can be refitted, then places the text by [textAlign]
 * inside whatever width the slot insists on. Intrinsics come straight from the text.
 */
private class FittedTextPolicy(
    private val textAlign: TextAlign,
    private val onSlotWidth: (Int) -> Unit,
) : MeasurePolicy {
    override fun MeasureScope.measure(measurables: List<Measurable>, constraints: Constraints): MeasureResult {
        onSlotWidth(constraints.maxWidth)
        val placeable = measurables.first().measure(constraints.copy(minWidth = 0))
        val width = maxOf(placeable.width, constraints.minWidth)
        val height = maxOf(placeable.height, constraints.minHeight)
        return layout(width, height) {
            val x = when (textAlign) {
                TextAlign.Center -> (width - placeable.width) / 2
                TextAlign.End, TextAlign.Right -> width - placeable.width
                else -> 0
            }
            placeable.placeRelative(x, (height - placeable.height) / 2)
        }
    }

    override fun IntrinsicMeasureScope.minIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) =
        measurables.first().minIntrinsicWidth(height)

    override fun IntrinsicMeasureScope.maxIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) =
        measurables.first().maxIntrinsicWidth(height)

    override fun IntrinsicMeasureScope.minIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) =
        measurables.first().minIntrinsicHeight(width)

    override fun IntrinsicMeasureScope.maxIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) =
        measurables.first().maxIntrinsicHeight(width)
}

/** Adds a zero-width break opportunity after each separator that sits between digits. */
internal fun breakAfterGroupSeparators(text: String): String = buildString(text.length + 4) {
    text.forEachIndexed { i, c ->
        append(c)
        val between = i > 0 && i < text.lastIndex && text[i - 1].isDigit() && text[i + 1].isDigit()
        if (between && c in ".,'’\u00a0") append('\u200B')
    }
}

/** The largest step of [style] down to [minFontSize] at which [text] fits in [maxWidth]. */
internal inline fun fitOnOneLine(
    text: String,
    style: TextStyle,
    maxWidth: Int,
    minFontSize: TextUnit,
    measureWidth: (TextStyle) -> Int,
): TextStyle {
    if (text.isEmpty() || maxWidth == Constraints.Infinity || !style.fontSize.isSp || !minFontSize.isSp) return style
    var current = style
    while (measureWidth(current) > maxWidth && current.fontSize.value > minFontSize.value) {
        val ratio = maxOf(0.92f, minFontSize.value / current.fontSize.value)
        val size = current.fontSize.value * ratio
        current = current.copy(
            fontSize = size.sp,
            lineHeight = if (current.lineHeight.isSp) (current.lineHeight.value * ratio).sp else current.lineHeight,
            letterSpacing = if (current.letterSpacing.isSp && current.letterSpacing.value > 0f) 0.sp else current.letterSpacing,
        )
    }
    return current
}
