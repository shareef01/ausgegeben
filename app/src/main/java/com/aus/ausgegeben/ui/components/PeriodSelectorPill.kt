package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSelector
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.brandAccentColor

/**
 * Premium pill-shaped period selector with a floating dropdown menu.
 */
@Composable
fun <T> PremiumPeriodSelector(
    options: List<T>,
    selected: T,
    labelFor: @Composable (T) -> String,
    onSelected: (T) -> Unit,
    modifier: Modifier = Modifier,
    isSelected: (T, T) -> Boolean = { a, b -> a == b },
) {
    if (options.isEmpty()) return

    var expanded by remember { mutableStateOf(false) }
    val pillShape = RoundedCornerShape(AppRadius.pill)
    val menuShape = RoundedCornerShape(AppSelector.menuCorner)
    val selectedLabel = labelFor(selected)
    val textColor = MaterialTheme.colorScheme.onBackground
    val pillBackground = textColor.copy(alpha = AppSelector.pillBackgroundAlpha)
    val accent = brandAccentColor()

    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .clip(pillShape)
                .background(pillBackground)
                .clickable { expanded = true }
                .padding(
                    horizontal = AppSelector.pillHorizontal,
                    vertical = AppSelector.pillVertical,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = selectedLabel,
                style = MaterialTheme.typography.labelLarge,
                color = textColor,
                fontWeight = FontWeight.Medium,
            )
            Icon(
                imageVector = Icons.Rounded.ExpandMore,
                contentDescription = null,
                tint = textColor.copy(alpha = 0.72f),
                modifier = Modifier
                    .padding(start = AppSpacing.xxs)
                    .size(20.dp),
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.appModalElevation(menuShape),
            shape = menuShape,
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            shadowElevation = 0.dp,
        ) {
            options.forEach { option ->
                val label = labelFor(option)
                val selectedOption = isSelected(option, selected)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = label,
                            color = if (selectedOption) accent else textColor,
                            fontWeight = if (selectedOption) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    },
                    onClick = {
                        expanded = false
                        onSelected(option)
                    },
                )
            }
        }
    }
}
