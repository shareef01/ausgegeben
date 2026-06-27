package com.aus.ausgegeben.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.aus.ausgegeben.ui.MainTabRoutes
import com.aus.ausgegeben.ui.Route

@Composable
fun MainTabPager(
    currentRoute: Route,
    onRouteChange: (Route) -> Unit,
    modifier: Modifier = Modifier,
    recordContent: @Composable () -> Unit,
    billsContent: @Composable () -> Unit,
    settingsContent: @Composable () -> Unit,
) {
    val tabs = MainTabRoutes

    AnimatedContent(
        targetState = currentRoute,
        modifier = modifier.fillMaxSize(),
        transitionSpec = {
            val fromIndex = tabs.indexOf(initialState).coerceAtLeast(0)
            val toIndex = tabs.indexOf(targetState).coerceAtLeast(0)
            val goingForward = toIndex >= fromIndex
            val enterOffset: (Int) -> Int = { width ->
                (width * if (goingForward) 0.1f else -0.1f).toInt()
            }
            val exitOffset: (Int) -> Int = { width ->
                (width * if (goingForward) -0.08f else 0.08f).toInt()
            }

            (slideInHorizontally(
                animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing),
                initialOffsetX = enterOffset,
            ) + fadeIn(animationSpec = tween(240, easing = FastOutSlowInEasing)))
                .togetherWith(
                    slideOutHorizontally(
                        animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing),
                        targetOffsetX = exitOffset,
                    ) + fadeOut(animationSpec = tween(200)),
                )
        },
        label = "main-tabs",
        contentKey = { it },
    ) { route ->
        val page = tabs.indexOf(route).coerceAtLeast(0)
        SwipeableTabSurface(
            canSwipeToPrevious = page > 0,
            canSwipeToNext = page < tabs.lastIndex,
            onSwipeToPrevious = { onRouteChange(tabs[page - 1]) },
            onSwipeToNext = { onRouteChange(tabs[page + 1]) },
        ) {
            Box(Modifier.fillMaxSize()) {
                when (route) {
                    Route.ExpenseList -> recordContent()
                    Route.CategoryManagement -> billsContent()
                    Route.Settings -> settingsContent()
                    else -> recordContent()
                }
            }
        }
    }
}
