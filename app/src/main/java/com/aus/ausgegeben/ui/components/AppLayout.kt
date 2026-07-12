package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppLayoutTokens

/** Bottom nav bar height (Scaffold already reserves this in content padding). */
val BottomNavBarHeight = MainBottomBarHeight + 1.dp

/** Extra space so the last list row clears the nav comfortably. */
val BottomScrollExtraPadding = 16.dp

@Composable
fun statusBarTopPadding(): Dp =
    WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

@Composable
fun navigationBarBottomPadding(): Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

/** Bottom padding for Bills and Settings lists. Scaffold handles nav bar inset. */
@Composable
fun tabScreenListBottomPadding(): PaddingValues =
    PaddingValues(bottom = BottomScrollExtraPadding)

/** Extra clearance for Record tab FAB floating above the nav bar.
 * Scaffold with contentWindowInsets = WindowInsets(0,0,0,0) disables
 * automatic FAB offset — we must reserve 120dp manually. */
@Composable
fun recordListBottomPadding(): PaddingValues =
    PaddingValues(bottom = 120.dp)
