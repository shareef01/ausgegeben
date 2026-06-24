package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import com.aus.ausgegeben.ui.MainTabRoutes
import com.aus.ausgegeben.ui.Route

@Composable
fun MainTabPager(
    currentRoute: Route,
    onTabSelected: (Route) -> Unit,
    modifier: Modifier = Modifier,
    recordContent: @Composable () -> Unit,
    billsContent: @Composable () -> Unit,
    settingsContent: @Composable () -> Unit,
) {
    val tabRoutes = MainTabRoutes
    val initialPage = tabRoutes.indexOf(currentRoute).coerceAtLeast(0)
    val pagerState = rememberPagerState(
        initialPage = initialPage,
        pageCount = { tabRoutes.size }
    )

    LaunchedEffect(currentRoute) {
        val index = tabRoutes.indexOf(currentRoute)
        if (index >= 0 && index != pagerState.currentPage && !pagerState.isScrollInProgress) {
            pagerState.animateScrollToPage(
                page = index,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMediumLow
                )
            )
        }
    }

    LaunchedEffect(pagerState.settledPage) {
        val route = tabRoutes[pagerState.settledPage]
        if (route != currentRoute) {
            onTabSelected(route)
        }
    }

    HorizontalPager(
        state = pagerState,
        modifier = modifier.fillMaxSize(),
        beyondViewportPageCount = 1,
        key = { tabRoutes[it].hashCode() }
    ) { page ->
        when (tabRoutes[page]) {
            Route.ExpenseList -> recordContent()
            Route.CategoryManagement -> billsContent()
            Route.Settings -> settingsContent()
            else -> Unit
        }
    }
}
