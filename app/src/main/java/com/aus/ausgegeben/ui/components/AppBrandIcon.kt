package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.dp

/** Minimal geometric "A" brand mark. */
@Composable
fun AppBrandIcon(
    modifier: Modifier = Modifier,
    size: Int = 64
) {
    val emerald = Color(0xFF10B981)
    val radius = (size * 0.22f).dp

    Box(
        modifier = modifier.size(size.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(size.dp)
                .clip(RoundedCornerShape(radius))
                .background(Color(0xFF0C0C0E)),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.size((size * 0.6f).dp)) {
                val cw = this.size.width
                val ch = this.size.height

                val apexPath = Path().apply {
                    // "A" letterform
                    moveTo(cw * 0.5f, ch * 0.0f)
                    lineTo(cw * 0.92f, ch * 0.95f)
                    lineTo(cw * 0.64f, ch * 0.95f)
                    lineTo(cw * 0.5f, ch * 0.5f)
                    lineTo(cw * 0.36f, ch * 0.95f)
                    lineTo(cw * 0.08f, ch * 0.95f)
                    close()
                    // Crossbar
                    moveTo(cw * 0.3f, ch * 0.62f)
                    lineTo(cw * 0.7f, ch * 0.62f)
                    lineTo(cw * 0.7f, ch * 0.72f)
                    lineTo(cw * 0.3f, ch * 0.72f)
                    close()
                }

                drawPath(path = apexPath, color = emerald, style = Fill)
            }
        }
    }
}
