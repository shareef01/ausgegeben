package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.abs

private const val SWIPE_COMMIT_PX = 72f

fun Modifier.tabHorizontalSwipe(
    enabled: Boolean = true,
    onSwipeToPrevious: (() -> Unit)? = null,
    onSwipeToNext: (() -> Unit)? = null
): Modifier {
    if (!enabled) return this
    return pointerInput(onSwipeToPrevious, onSwipeToNext) {
        var total = 0f
        detectHorizontalDragGestures(
            onDragStart = { total = 0f },
            onDragEnd = {
                when {
                    total > SWIPE_COMMIT_PX -> onSwipeToPrevious?.invoke()
                    total < -SWIPE_COMMIT_PX -> onSwipeToNext?.invoke()
                }
                total = 0f
            },
            onHorizontalDrag = { _, amount ->
                if (abs(amount) > 2f) total += amount
            }
        )
    }
}

/**
 * Transparent swipe band on the title strip so horizontal tab navigation
 * does not fight row swipe-to-delete/edit or vertical list scrolling.
 */
@Composable
fun SwipeableTabSurface(
    canSwipeToPrevious: Boolean,
    canSwipeToNext: Boolean,
    onSwipeToPrevious: () -> Unit,
    onSwipeToNext: () -> Unit,
    titleBandHeight: Dp = 104.dp,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    Box(modifier = modifier.fillMaxSize()) {
        content()

        TabSwipeBand(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(titleBandHeight),
            enabled = canSwipeToPrevious || canSwipeToNext,
            onSwipeToPrevious = if (canSwipeToPrevious) onSwipeToPrevious else null,
            onSwipeToNext = if (canSwipeToNext) onSwipeToNext else null
        )
    }
}

@Composable
private fun TabSwipeBand(
    modifier: Modifier,
    enabled: Boolean,
    onSwipeToPrevious: (() -> Unit)?,
    onSwipeToNext: (() -> Unit)?
) {
    Box(
        modifier = modifier.tabHorizontalSwipe(
            enabled = enabled,
            onSwipeToPrevious = onSwipeToPrevious,
            onSwipeToNext = onSwipeToNext
        )
    )
}
