package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.util.ReplacePlanner

@Composable
fun UnfinishedReplacementBanner(
    op: ReplacePlanner.RestoreOperationDoc,
    onResume: () -> Unit,
    onRollback: () -> Unit,
    onDismiss: () -> Unit,
    busy: Boolean,
    modifier: Modifier = Modifier,
) {
    val isForeignPlatform = op.initiatorPlatform != "android"

    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Column(
            modifier = Modifier
                .padding(AppSpacing.md)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(AppSpacing.sm),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.md),
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .appGlassCard(RoundedCornerShape(AppRadius.md)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Warning,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(24.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.settings_replace_unresolved_banner),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (isForeignPlatform) {
                        Text(
                            text = stringResource(R.string.settings_replace_foreign_platform, op.initiatorPlatform),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!op.error.isNullOrBlank()) {
                        Text(
                            text = op.error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm, Alignment.End),
            ) {
                if (op.phase == ReplacePlanner.RestorePhase.COMPLETED || op.phase == ReplacePlanner.RestorePhase.ROLLED_BACK) {
                    AppButton(
                        onClick = onDismiss,
                        enabled = !busy,
                        modifier = Modifier.height(36.dp),
                    ) {
                        Text(stringResource(R.string.settings_replace_dismiss))
                    }
                } else {
                    AppOutlinedButton(
                        onClick = onRollback,
                        enabled = !busy,
                        modifier = Modifier.height(36.dp),
                    ) {
                        Text(stringResource(R.string.settings_replace_rollback))
                    }
                    if (!isForeignPlatform) {
                        AppButton(
                            onClick = onResume,
                            enabled = !busy,
                            modifier = Modifier.height(36.dp),
                        ) {
                            Text(stringResource(R.string.settings_replace_resume))
                        }
                    }
                }
            }
        }
    }
}
