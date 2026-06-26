package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import com.aus.ausgegeben.ui.MainTabRoutes
import com.aus.ausgegeben.ui.Route
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()
    val initialPage = tabs.indexOfFirst { it == currentRoute }.coerceAtLeast(0)
    val pagerState = rememberPagerState(initialPage = initialPage) { tabs.size }

    fun scrollToPage(page: Int) {
        val clamped = page.coerceIn(0, tabs.lastIndex)
        scope.launch {
            pagerState.scrollToPage(clamped)
        }
    }

    LaunchedEffect(currentRoute) {
        val target = tabs.indexOfFirst { it == currentRoute }.coerceAtLeast(0)
        if (pagerState.currentPage != target) {
            pagerState.scrollToPage(target)
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.isScrollInProgress to pagerState.settledPage }
            .filter { !it.first }
            .map { it.second }
            .distinctUntilChanged()
            .collect { page ->
                val route = tabs[page]
                if (route != currentRoute) {
                    onRouteChange(route)
                }
            }
    }

    HorizontalPager(
        state = pagerState,
        modifier = modifier.fillMaxSize(),
        beyondViewportPageCount = 0,
        userScrollEnabled = false,
    ) { page ->
        val route = tabs[page]
        key(route) {
            SwipeableTabSurface(
                canSwipeToPrevious = page > 0,
                canSwipeToNext = page < tabs.lastIndex,
                onSwipeToPrevious = { scrollToPage(page - 1) },
                onSwipeToNext = { scrollToPage(page + 1) },
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
}
