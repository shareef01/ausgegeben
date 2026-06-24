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
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.ui.theme.BackgroundGlowCool
import com.aus.ausgegeben.ui.theme.BackgroundGlowMint
import com.aus.ausgegeben.ui.theme.BackgroundGlowWarm
import com.aus.ausgegeben.ui.theme.SystemBlue
import com.aus.ausgegeben.ui.theme.SystemViolet

@Composable
fun AppScreen(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    val isDark = MaterialTheme.colorScheme.background.luminance() < 0.5f

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .then(
                if (isDark) {
                    Modifier
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    BackgroundGlowWarm.copy(alpha = 0.42f),
                                    Color.Transparent
                                ),
                                center = Offset(0.1f, 0.05f),
                                radius = 900f
                            )
                        )
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    BackgroundGlowCool.copy(alpha = 0.32f),
                                    Color.Transparent
                                ),
                                center = Offset(0.9f, 0.15f),
                                radius = 780f
                            )
                        )
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    BackgroundGlowMint.copy(alpha = 0.2f),
                                    Color.Transparent
                                ),
                                center = Offset(0.5f, 1f),
                                radius = 1100f
                            )
                        )
                } else {
                    Modifier
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    AccentCoral.copy(alpha = 0.08f),
                                    Color.Transparent
                                ),
                                center = Offset(0.08f, 0.04f),
                                radius = 750f
                            )
                        )
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    SystemBlue.copy(alpha = 0.06f),
                                    Color.Transparent
                                ),
                                center = Offset(0.92f, 0.18f),
                                radius = 680f
                            )
                        )
                        .background(
                            Brush.radialGradient(
                                colors = listOf(
                                    SystemViolet.copy(alpha = 0.05f),
                                    Color.Transparent
                                ),
                                center = Offset(0.5f, 0.95f),
                                radius = 900f
                            )
                        )
                }
            ),
        content = content
    )
}
