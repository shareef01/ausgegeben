package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Bottom nav shell height (raised add button included). */
val BottomNavBarHeight = MainBottomBarHeight

/** Extra space so the last list row clears FAB / nav comfortably. */
val BottomScrollExtraPadding = 24.dp

@Composable
fun statusBarTopPadding(): Dp =
    WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

@Composable
fun navigationBarBottomPadding(): Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

/** Bottom padding for scrollable lists on tab screens (nav bar is in Scaffold). */
@Composable
fun tabScreenListBottomPadding(): PaddingValues {
    val gestureInset = navigationBarBottomPadding()
    return PaddingValues(bottom = BottomScrollExtraPadding + gestureInset)
}

/** Bottom padding for the record tab list (add button is inside the nav shell). */
@Composable
fun recordListBottomPadding(): PaddingValues = tabScreenListBottomPadding()
