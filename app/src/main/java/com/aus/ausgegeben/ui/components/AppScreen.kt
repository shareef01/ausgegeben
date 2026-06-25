package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

@Composable
fun AppScreen(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    val isDark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val base = MaterialTheme.colorScheme.background
    val accent = if (isDark) {
        Color(0xFF1E181A)
    } else {
        Color(0xFFF8EEEC)
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(base)
            .background(
                Brush.linearGradient(
                    colors = listOf(accent.copy(alpha = 0.55f), Color.Transparent),
                    start = Offset(0f, 0f),
                    end = Offset(800f, 600f)
                )
            ),
        content = content
    )
}
