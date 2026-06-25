package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.aus.ausgegeben.ui.theme.BackgroundElevated

@Composable
fun AppScreen(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    val isDark = isSystemInDarkTheme()
    val base = MaterialTheme.colorScheme.background
    val primary = MaterialTheme.colorScheme.primary

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(base)
            .then(
                if (isDark) {
                    Modifier.background(
                        Brush.radialGradient(
                            colors = listOf(
                                primary.copy(alpha = 0.04f),
                                Color.Transparent
                            ),
                            center = Offset(0.2f, 0f),
                            radius = 1200f
                        )
                    ).background(
                        Brush.radialGradient(
                            colors = listOf(
                                BackgroundElevated.copy(alpha = 0.6f),
                                Color.Transparent
                            ),
                            center = Offset(0.8f, 1f),
                            radius = 900f
                        )
                    )
                } else {
                    Modifier.background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.White,
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                            )
                        )
                    )
                }
            ),
        content = content
    )
}
