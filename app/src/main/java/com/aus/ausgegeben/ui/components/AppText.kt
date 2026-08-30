package com.aus.ausgegeben.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Auto-scaling text composable that dynamically reduces font size and tightens
 * letter spacing when visual overflow is detected, avoiding awkward clipping (e.g. "NET BALAN...").
 */
@Composable
fun AutoScalingText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    minFontSize: TextUnit = 8.5.sp,
    maxLines: Int = 1,
    textAlign: TextAlign = TextAlign.Center,
    overflow: TextOverflow = TextOverflow.Ellipsis
) {
    var scaledStyle by remember(text, style) { mutableStateOf(style) }
    var readyToDraw by remember(text, style) { mutableStateOf(false) }

    Text(
        text = text,
        style = scaledStyle,
        maxLines = maxLines,
        textAlign = textAlign,
        overflow = overflow,
        softWrap = false,
        onTextLayout = { textLayoutResult ->
            if (textLayoutResult.hasVisualOverflow && scaledStyle.fontSize > minFontSize) {
                val nextSize = (scaledStyle.fontSize.value - 0.5f).sp
                if (nextSize >= minFontSize) {
                    val nextLetterSpacing = if (scaledStyle.letterSpacing.value > 0.2f) {
                        (scaledStyle.letterSpacing.value - 0.2f).sp
                    } else scaledStyle.letterSpacing
                    scaledStyle = scaledStyle.copy(
                        fontSize = nextSize,
                        letterSpacing = nextLetterSpacing
                    )
                } else {
                    readyToDraw = true
                }
            } else {
                readyToDraw = true
            }
        },
        modifier = modifier.drawWithContent {
            if (readyToDraw) {
                drawContent()
            }
        }
    )
}
