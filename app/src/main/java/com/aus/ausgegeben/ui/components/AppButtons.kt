package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.rememberAppHaptics

@Composable
fun AppButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    containerColor: Color = MaterialTheme.colorScheme.onBackground,
    contentColor: Color = MaterialTheme.colorScheme.background,
    content: @Composable RowScope.() -> Unit
) {
    val backgroundColor = if (enabled) containerColor else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (enabled) contentColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)

    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 52.dp)
            .then(
                if (enabled) {
                    Modifier.shadow(
                        elevation = 12.dp,
                        shape = RoundedCornerShape(AppRadius.md),
                        ambientColor = containerColor.copy(alpha = 0.4f),
                        spotColor = containerColor
                    )
                } else Modifier
            )
            .clip(RoundedCornerShape(AppRadius.md))
            .background(backgroundColor)
            .smoothClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = AppSpacing.lg, vertical = AppSpacing.sm),
        contentAlignment = Alignment.Center
    ) {
        CompositionLocalProvider(LocalContentColor provides textColor) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
                content = content
            )
        }
    }
}

@Composable
fun AppTextButton(
    onClick: () -> Unit,
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    contentColor: Color = MaterialTheme.colorScheme.primary
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(AppRadius.md))
            .smoothClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (enabled) contentColor else contentColor.copy(alpha = 0.38f),
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun AppOutlinedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    contentColor: Color = MaterialTheme.colorScheme.primary,
    borderColor: Color = appBorderColor(),
    content: @Composable RowScope.() -> Unit
) {
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 52.dp)
            .clip(RoundedCornerShape(AppRadius.md))
            .border(1.dp, if (enabled) borderColor else borderColor.copy(alpha = 0.38f), RoundedCornerShape(AppRadius.md))
            .smoothClickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = AppSpacing.lg, vertical = AppSpacing.sm),
        contentAlignment = Alignment.Center
    ) {
        CompositionLocalProvider(LocalContentColor provides if (enabled) contentColor else contentColor.copy(alpha = 0.38f)) {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
                content = content
            )
        }
    }
}

@Composable
fun AppIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = MaterialTheme.colorScheme.onBackground
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CircleShape)
            .smoothClickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) tint else tint.copy(alpha = 0.38f),
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
fun AppFab(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
    onLongClick: (() -> Unit)? = null,
) {
    val haptics = rememberAppHaptics()
    Box(
        modifier = modifier
            .size(64.dp)
            .shadow(
                elevation = 20.dp,
                spotColor = containerColor,
                ambientColor = containerColor.copy(alpha = 0.4f),
                shape = CircleShape
            )
            .clip(CircleShape)
            .background(containerColor)
            .combinedClickable(
                onClick = {
                    haptics.medium()
                    onClick()
                },
                onLongClick = onLongClick?.let {
                    {
                        haptics.success()
                        it()
                    }
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = contentColor,
            modifier = Modifier.size(32.dp),
        )
    }
}
