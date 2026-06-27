package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.History
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.GroupedShape
import com.aus.ausgegeben.ui.theme.appBorderColor
import com.aus.ausgegeben.util.AnalyticsPeriodOption

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsPeriodPicker(
    options: List<AnalyticsPeriodOption>,
    selectedKey: String,
    selectedLabel: String,
    onSelected: (AnalyticsPeriodOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    var sheetOpen by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val triggerShape = RoundedCornerShape(AppRadius.xl)
    val accent = MaterialTheme.colorScheme.primary

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(triggerShape)
                .background(MaterialTheme.colorScheme.surface)
                .border(AppElevation.cardBorder, appBorderColor(), triggerShape)
                .clickable { sheetOpen = true }
                .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.CalendarMonth,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.period_picker_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = selectedLabel,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Icon(
                imageVector = Icons.Rounded.ExpandMore,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (sheetOpen) {
        val allTimeOption = options.firstOrNull { it.storageKey == "all_time" }
        val monthOptions = options.filter { it.storageKey != "all_time" }

        ModalBottomSheet(
            onDismissRequest = { sheetOpen = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            dragHandle = { BottomSheetDefaults.DragHandle() },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = AppSpacing.xl),
            ) {
                Text(
                    text = stringResource(R.string.period_picker_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs),
                )
                Text(
                    text = stringResource(R.string.period_picker_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = AppSpacing.xxs),
                )

                if (allTimeOption != null) {
                    PeriodOptionRow(
                        label = stringResource(R.string.period_all_time),
                        selected = allTimeOption.storageKey == selectedKey,
                        leadingIcon = Icons.Rounded.History,
                        onClick = {
                            onSelected(allTimeOption)
                            sheetOpen = false
                        },
                        modifier = Modifier.padding(
                            horizontal = AppSpacing.md,
                            vertical = AppSpacing.sm,
                        ),
                        prominent = true,
                    )
                }

                if (monthOptions.isNotEmpty()) {
                    GroupedSectionLabel(
                        text = stringResource(R.string.period_picker_months),
                        modifier = Modifier.padding(top = AppSpacing.xs),
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = AppSpacing.md)
                            .clip(GroupedShape)
                            .appCard(shape = GroupedShape, bordered = true),
                    ) {
                        monthOptions.forEachIndexed { index, option ->
                            if (index > 0) {
                                IosSeparator()
                            }
                            PeriodOptionRow(
                                label = option.label,
                                selected = option.storageKey == selectedKey,
                                leadingIcon = Icons.Rounded.DateRange,
                                onClick = {
                                    onSelected(option)
                                    sheetOpen = false
                                },
                                modifier = Modifier.padding(
                                    horizontal = AppSpacing.md,
                                    vertical = AppSpacing.sm,
                                ),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PeriodOptionRow(
    label: String,
    selected: Boolean,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    prominent: Boolean = false,
) {
    val accent = MaterialTheme.colorScheme.primary
    val shape = RoundedCornerShape(AppRadius.lg)
    val background = when {
        selected && prominent -> accent.copy(alpha = 0.12f)
        selected -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
        prominent -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
        else -> MaterialTheme.colorScheme.surface
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(background)
            .then(
                if (prominent && selected) {
                    Modifier.border(AppElevation.cardBorder, accent.copy(alpha = 0.35f), shape)
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick)
            .padding(horizontal = AppSpacing.sm, vertical = AppSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(
                    if (selected) accent.copy(alpha = 0.16f)
                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = if (selected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        Text(
            text = label,
            style = if (prominent) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyLarge,
            color = if (selected) accent else MaterialTheme.colorScheme.onBackground,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
