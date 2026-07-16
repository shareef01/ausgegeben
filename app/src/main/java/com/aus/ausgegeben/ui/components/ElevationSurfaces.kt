package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AlertDialogDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.*

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
        containerColor = appElevatedSurface(),
        tonalElevation = if (isAppDarkTheme()) AlertDialogDefaults.TonalElevation else 0.dp,
        title = title,
        text = text,
        confirmButton = confirmButton,
        dismissButton = dismissButton,
    )
}

@Composable
fun AppDestructiveConfirmDialog(
    onDismissRequest: () -> Unit,
    onConfirm: () -> Unit,
    confirmLabel: String,
    modifier: Modifier = Modifier,
    dismissLabel: String = stringResource(R.string.action_cancel),
    title: @Composable (() -> Unit)? = null,
    text: @Composable (() -> Unit)? = null,
) {
    AppAlertDialog(
        onDismissRequest = onDismissRequest,
        modifier = modifier,
        title = title,
        text = text,
        confirmButton = {
            AppButton(
                onClick = onConfirm,
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = Color.White
            ) {
                Text(confirmLabel.lowercase())
            }
        },
        dismissButton = {
            AppTextButton(
                onClick = onDismissRequest,
                text = dismissLabel.lowercase(),
                contentColor = MaterialTheme.colorScheme.onSurface
            )
        }
    )
}

@Composable
fun AppDialogBodyText(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = readableSecondaryColor(),
        modifier = modifier
    )
}
