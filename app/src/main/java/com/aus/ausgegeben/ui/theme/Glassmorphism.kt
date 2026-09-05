package com.aus.ausgegeben.ui.theme

import android.os.Build
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Applies a glassmorphism effect to the composable.
 * Uses native Blur effect on Android 12+, falling back to a tinted semi-transparent background on older APIs.
 */
fun Modifier.glassMorphic(
    backgroundColor: Color = Color(0x99000000), // Semi-transparent by default
    blurRadius: Float = 24f
): Modifier = this.then(
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Modifier
            .graphicsLayer {
                renderEffect = android.graphics.RenderEffect.createBlurEffect(
                    blurRadius,
                    blurRadius,
                    android.graphics.Shader.TileMode.DECAL
                ).asComposeRenderEffect()
                // Clip layer so blur doesn't bleed outside bounds
                clip = true
            }
            .drawBehind { drawRect(backgroundColor) }
    } else {
        Modifier.drawBehind { drawRect(backgroundColor) }
    }
)
