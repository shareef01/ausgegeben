package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.RecurringIssueState
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseTextColor

/**
 * Non-destructive warning for quarantined recurring occurrences.
 *
 * A quarantined template means a scheduled transaction may not have been recorded, so the
 * screen must not read as a successful synchronization while this is shown. The banner itself
 * changes nothing: [onReview] opens the recurring sheet, where each affected item names its
 * problem and offers the fix. Pass null where the sheet is already open.
 */
@Composable
fun RecurringIssuesBanner(state: RecurringIssueState, modifier: Modifier = Modifier, onReview: (() -> Unit)? = null) {
    if (!state.showWarning) return
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
    ) {
        Column(modifier = Modifier.padding(start = AppSpacing.md, end = AppSpacing.md, top = 12.dp, bottom = if (onReview == null) 12.dp else 0.dp)) {
            Text(
                text = pluralStringResource(R.plurals.recurring_issues_warning, state.affectedTemplates, state.affectedTemplates),
                style = MaterialTheme.typography.bodySmall,
                // The brand coral is a fill colour; as small text on the light card it measured
                // 2.5:1. The ink-safe variant keeps the hue and darkens it to AA where needed.
                color = financeExpenseTextColor(),
            )
            if (onReview != null) {
                TextButton(onClick = onReview) {
                    Text(
                        text = stringResource(R.string.recurring_issues_review),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        textDecoration = TextDecoration.Underline,
                        color = financeExpenseTextColor(),
                    )
                }
            }
        }
    }
}
