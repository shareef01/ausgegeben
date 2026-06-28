package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import androidx.compose.ui.text.TextStyle

/**
 * High-Fidelity Radiant Branding Icon.
 * Features a multi-layered Emerald-to-Forest gradient with a 
 * specular inner border and high-intensity neon drop shadow.
 */
@Composable
fun AppBrandIcon(
    modifier: Modifier = Modifier,
    size: Int = 64
) {
    val emerald = Color(0xFF10B981)
    val forest = Color(0xFF047857)
    val radius = (size * 0.28f).dp
    
    Box(
        modifier = modifier
            .size(size.dp)
            .shadow(
                elevation = (size / 3).dp,
                shape = RoundedCornerShape(radius),
                spotColor = emerald,
                ambientColor = emerald.copy(alpha = 0.4f)
            )
            .clip(RoundedCornerShape(radius))
            .background(
                Brush.linearGradient(
                    colors = listOf(emerald, forest)
                )
            )
            .border(
                width = 1.dp,
                brush = Brush.linearGradient(
                    colors = listOf(Color.White.copy(alpha = 0.35f), Color.Transparent)
                ),
                shape = RoundedCornerShape(radius)
            ),
        contentAlignment = Alignment.Center
    ) {
        // Subtle Inner Glow
        Box(
            modifier = Modifier
                .size((size * 0.85f).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color.White.copy(alpha = 0.12f), Color.Transparent)
                    )
                )
        )
        
        Text(
            text = "a",
            style = TextStyle(
                color = Color.White,
                fontSize = (size * 0.6f).sp,
                fontWeight = FontWeight.Light,
                letterSpacing = (-1).sp
            )
        )
    }
}
