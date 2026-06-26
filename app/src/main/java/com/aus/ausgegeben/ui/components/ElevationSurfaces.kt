package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AlertDialogDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppShadowColor
import com.aus.ausgegeben.ui.theme.isAppDarkTheme

/**
 * Premium diffuse elevation for dropdown menus and floating popovers.
 * Light mode: soft dual-layer shadow + hairline border per design spec.
 */
@Composable
fun Modifier.appPopupElevation(shape: Shape = RoundedCornerShape(AppRadius.lg)): Modifier {
    return if (isAppDarkTheme()) {
        shadow(
            elevation = AppElevation.popup,
            shape = shape,
            ambientColor = AppShadowColor.ambientDark,
            spotColor = AppShadowColor.spotDark,
        ).border(AppElevation.cardBorder, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f), shape)
    } else {
        shadow(
            elevation = AppElevation.popup,
            shape = shape,
            ambientColor = AppShadowColor.ambientLight,
            spotColor = AppShadowColor.spotLight,
        ).border(AppElevation.cardBorder, AppShadowColor.modalBorderLight, shape)
    }
}

/** Elevated modal sheet — same shadow system with a larger corner radius. */
@Composable
fun Modifier.appModalElevation(shape: Shape = RoundedCornerShape(AppRadius.xl)): Modifier =
    if (isAppDarkTheme()) {
        shadow(
            elevation = AppElevation.modal,
            shape = shape,
            ambientColor = AppShadowColor.ambientDark,
            spotColor = AppShadowColor.spotDark,
        ).border(AppElevation.cardBorder, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f), shape)
    } else {
        shadow(
            elevation = AppElevation.modal,
            shape = shape,
            ambientColor = AppShadowColor.ambientLight,
            spotColor = AppShadowColor.spotLight,
        ).border(AppElevation.cardBorder, AppShadowColor.modalBorderLight, shape)
    }

@Composable
fun AppAlertDialog(
    onDismissRequest: () -> Unit,
    confirmButton: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    dismissButton: @Composable (() -> Unit)? = null,
    title: @Composable (() -> Unit)? = null,
    text: @Composable (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(AppRadius.xl)
    AlertDialog(
        onDismissRequest = onDismissRequest,
        modifier = modifier.appModalElevation(shape),
        shape = shape,
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = if (isAppDarkTheme()) AlertDialogDefaults.TonalElevation else 0.dp,
        title = title,
        text = text,
        confirmButton = confirmButton,
        dismissButton = dismissButton,
    )
}
