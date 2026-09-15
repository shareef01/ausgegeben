package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
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

/**
 * Shown when a previous delete-account attempt wiped the cloud data but could not
 * remove the login. Such an account cannot record anything — seeding is blocked while
 * the marker is set — and finishing the deletion is the only way out: the deletion
 * marker is a permanent server-side write-freeze with no client permission to clear it
 * (see firestore.rules and docs/maintenance.md), so there is no "keep the account"
 * path on either platform, on the web or here (DOC-4).
 */
@Composable
fun AccountDeletionPendingBanner(
    onFinishDeleting: () -> Unit,
    busy: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
            // Announced on appearance: the account is unusable until one of these is
            // chosen, so a screen-reader user should not have to discover it by scrubbing.
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
                        imageVector = Icons.Rounded.ErrorOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.settings_deletion_pending_title),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        text = stringResource(R.string.settings_deletion_pending),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
            ) {
                // AppTextButton sizes itself from padding alone and can land under the
                // 48dp floor. This button is the only way out of an account that cannot
                // record anything, so the target is pinned locally rather than by
                // changing the shared component and reflowing every other caller.
                AppTextButton(
                    onClick = onFinishDeleting,
                    text = stringResource(R.string.settings_deletion_finish).lowercase(),
                    enabled = !busy,
                    contentColor = MaterialTheme.colorScheme.error,
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
    }
}
