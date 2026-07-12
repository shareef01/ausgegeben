package com.aus.ausgegeben.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.graphicsLayer
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import kotlinx.coroutines.delay

@Composable
fun SuccessCelebration(
    visible: Boolean,
    onFinished: () -> Unit
) {
    if (!visible) return

    LaunchedEffect(Unit) {
        delay(1100)
        onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background.copy(alpha = 0.7f)),
        contentAlignment = Alignment.Center
    ) {
        var animateIn by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { animateIn = true }

        val scale by animateFloatAsState(
            targetValue = if (animateIn) 1f else 0.4f,
            animationSpec = spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMedium),
            label = "scale"
        )
        
        val alpha by animateFloatAsState(
            targetValue = if (animateIn) 1f else 0f,
            animationSpec = tween(400),
            label = "alpha"
        )

        Box(
            modifier = Modifier
                .size(140.dp)
                .graphicsLayer {
                    this.scaleX = scale
                    this.scaleY = scale
                    this.alpha = alpha
                }
                .appGlassCard(CircleShape)
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = financeIncomeColor(),
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}
