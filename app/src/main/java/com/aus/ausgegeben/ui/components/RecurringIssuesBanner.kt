package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.RecurringIssueState
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing

/**
 * Non-destructive warning for quarantined recurring occurrences.
 *
 * A quarantined template means a scheduled transaction may not have been recorded, so the
 * screen must not read as a successful synchronization while this is shown. There are no
 * repair or destructive controls here by design: resolution requires an explicit owner action
 * that is not part of this release.
 */
@Composable
fun RecurringIssuesBanner(state: RecurringIssueState, modifier: Modifier = Modifier) {
    if (!state.showWarning) return
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
    ) {
        Text(
            text = stringResource(R.string.recurring_issues_warning, state.affectedTemplates),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = 12.dp),
        )
    }
}
