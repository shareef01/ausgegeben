package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppRadius

@Composable
fun AppSnackbar(
    snackbarData: SnackbarData,
    modifier: Modifier = Modifier,
    actionColor: Color = MaterialTheme.colorScheme.primary,
    containerColor: Color = MaterialTheme.colorScheme.inverseSurface,
    contentColor: Color = MaterialTheme.colorScheme.inverseOnSurface,
) {
    Snackbar(
        snackbarData = snackbarData,
        modifier = modifier.padding(12.dp),
        actionColor = actionColor,
        containerColor = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(AppRadius.md),
        dismissActionContentColor = contentColor.copy(alpha = 0.6f)
    )
}
