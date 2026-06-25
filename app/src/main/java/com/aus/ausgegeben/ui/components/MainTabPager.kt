package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import com.aus.ausgegeben.ui.MainTabRoutes
import com.aus.ausgegeben.ui.Route
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlin.math.absoluteValue

private val TabScrollSpring = spring<Float>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessMediumLow
)

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
    val initialPage = tabs.indexOfFirst { it == currentRoute }.coerceAtLeast(0)
    val pagerState = rememberPagerState(initialPage = initialPage) { tabs.size }

    LaunchedEffect(currentRoute) {
        val target = tabs.indexOfFirst { it == currentRoute }.coerceAtLeast(0)
        if (pagerState.currentPage != target || pagerState.targetPage != target) {
            pagerState.animateScrollToPage(target, animationSpec = TabScrollSpring)
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.isScrollInProgress to pagerState.settledPage }
            .filter { !it.first }
            .map { it.second }
            .distinctUntilChanged()
            .collect { page ->
                val route = tabs[page]
                onRouteChange(route)
            }
    }

    HorizontalPager(
        state = pagerState,
        modifier = modifier.fillMaxSize(),
        beyondViewportPageCount = 1,
        userScrollEnabled = true,
    ) { page ->
        val route = tabs[page]
        val pageOffset = (
            (pagerState.currentPage - page) + pagerState.currentPageOffsetFraction
        ).absoluteValue.coerceIn(0f, 1f)
        key(route) {
            Box(
                Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        alpha = 1f - pageOffset * 0.18f
                        scaleX = 1f - pageOffset * 0.025f
                        scaleY = 1f - pageOffset * 0.025f
                    }
            ) {
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
