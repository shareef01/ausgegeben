package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitHorizontalTouchSlopOrCancellation
import androidx.compose.foundation.gestures.horizontalDrag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.abs

private const val SWIPE_COMMIT_PX = 72f

private fun Modifier.tabHorizontalSwipe(
    titleBandHeight: Dp,
    onSwipeToPrevious: (() -> Unit)?,
    onSwipeToNext: (() -> Unit)?,
): Modifier {
    if (onSwipeToPrevious == null && onSwipeToNext == null) return this
    return pointerInput(titleBandHeight, onSwipeToPrevious, onSwipeToNext) {
        val titleBandHeightPx = titleBandHeight.toPx()
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            if (down.position.y >= titleBandHeightPx) return@awaitEachGesture

            var total = 0f
            val dragStart = awaitHorizontalTouchSlopOrCancellation(down.id) { change, overSlop ->
                change.consume()
                if (abs(overSlop) > 2f) total += overSlop
            } ?: return@awaitEachGesture
            val completed = horizontalDrag(dragStart.id) { change ->
                val distance = change.positionChange().x
                if (abs(distance) > 2f) total += distance
                change.consume()
            }
            if (completed) {
                when {
                    total > SWIPE_COMMIT_PX -> onSwipeToPrevious?.invoke()
                    total < -SWIPE_COMMIT_PX -> onSwipeToNext?.invoke()
                }
            }
        }
    }
}

/**
 * Handles horizontal drags starting in the title strip. Listening on the
 * container lets title actions receive taps and keeps row gestures below it.
 */
@Composable
fun SwipeableTabSurface(
    canSwipeToPrevious: Boolean,
    canSwipeToNext: Boolean,
    onSwipeToPrevious: () -> Unit,
    onSwipeToNext: () -> Unit,
    titleBandHeight: Dp = 104.dp,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .tabHorizontalSwipe(
                titleBandHeight = titleBandHeight,
                onSwipeToPrevious = if (canSwipeToPrevious) onSwipeToPrevious else null,
                onSwipeToNext = if (canSwipeToNext) onSwipeToNext else null,
            ),
        content = content,
    )
}
