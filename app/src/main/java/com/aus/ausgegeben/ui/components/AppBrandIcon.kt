package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.dp

/**
 * Flagship "Geometric Apex" Branding Icon.
 * Replaces the simple lowercase "a" with the sharp, high-fidelity 
 * mark from the launcher icon. Features an obsidian base and 
 * radiant neon emerald geometry.
 */
@Composable
fun AppBrandIcon(
    modifier: Modifier = Modifier,
    size: Int = 64
) {
    val emerald = Color(0xFF10B981)
    val mint = Color(0xFF6EE7B7)
    val forest = Color(0xFF065F46)
    val radius = (size * 0.32f).dp
    
    Box(
        modifier = modifier.size(size.dp),
        contentAlignment = Alignment.Center
    ) {
        // Outer Neon Halo
        Box(
            modifier = Modifier
                .size((size * 1.25f).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(emerald.copy(alpha = 0.22f), Color.Transparent)
                    )
                )
        )

        // Obsidian Glass Base
        Box(
            modifier = Modifier
                .size(size.dp)
                .shadow(
                    elevation = (size / 4).dp,
                    shape = RoundedCornerShape(radius),
                    spotColor = emerald,
                    ambientColor = emerald.copy(alpha = 0.2f)
                )
                .clip(RoundedCornerShape(radius))
                .background(Color(0xFF0D0D10)) // Deep Obsidian
                .border(
                    width = 1.dp,
                    brush = Brush.linearGradient(
                        colors = listOf(Color.White.copy(alpha = 0.15f), Color.Transparent)
                    ),
                    shape = RoundedCornerShape(radius)
                ),
            contentAlignment = Alignment.Center
        ) {
            // "Geometric Apex" Mark Rendering
            Canvas(modifier = Modifier.size((size * 0.6f).dp)) {
                val w = size.width
                val h = size.height
                
                val apexPath = Path().apply {
                    moveTo(w * 0.5f, h * 0.05f)
                    lineTo(w * 0.88f, h * 0.95f)
                    lineTo(w * 0.65f, h * 0.95f)
                    lineTo(w * 0.5f, h * 0.55f)
                    lineTo(w * 0.35f, h * 0.95f)
                    lineTo(w * 0.12f, h * 0.95f)
                    close()
                }

                // Main Gradient Fill
                drawPath(
                    path = apexPath,
                    brush = Brush.linearGradient(
                        colors = listOf(mint, emerald, forest)
                    ),
                    style = Fill
                )
                
                // Apex Spark
                drawCircle(
                    color = Color.White,
                    radius = w * 0.04f,
                    center = androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.12f)
                )
            }
        }
    }
}
