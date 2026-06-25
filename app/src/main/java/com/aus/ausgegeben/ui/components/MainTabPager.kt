package com.aus.ausgegeben.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.aus.ausgegeben.ui.Route

/**
 * Instant tab switching without HorizontalPager swipe conflicts.
 * Tabs are selected only via the bottom bar for predictable navigation.
 */
@Composable
fun MainTabPager(
    currentRoute: Route,
    modifier: Modifier = Modifier,
    recordContent: @Composable () -> Unit,
    billsContent: @Composable () -> Unit,
    settingsContent: @Composable () -> Unit,
) {
    AnimatedContent(
        targetState = currentRoute,
        modifier = modifier.fillMaxSize(),
        transitionSpec = {
            fadeIn(animationSpec = tween(140)) togetherWith fadeOut(animationSpec = tween(90))
        },
        label = "mainTab"
    ) { route ->
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
