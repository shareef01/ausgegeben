package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.aus.ausgegeben.ui.theme.AppAurora

@Composable
fun AppScreen(
    modifier: Modifier = Modifier,
    aurora: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AppAurora.background()),
    ) {
        if (aurora) {
            Box(modifier = Modifier.fillMaxSize().background(AppAurora.brush()))
        }
        content()
    }
}
