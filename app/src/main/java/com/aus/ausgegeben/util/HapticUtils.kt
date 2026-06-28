package com.aus.ausgegeben.util

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

@Composable
fun rememberAppHaptics(): AppHaptics {
    val hapticFeedback = LocalHapticFeedback.current
    return remember(hapticFeedback) { AppHaptics(hapticFeedback) }
}

class AppHaptics(private val haptic: HapticFeedback) {
    fun light() {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }

    fun medium() {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    fun success() {
        // Compose doesn't have a specific 'success' type, but we can simulate it
        // or use the standard ones consistently.
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    fun toggle() {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
}
