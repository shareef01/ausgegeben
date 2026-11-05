package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.RecurringIssue

/**
 * Business state for the recurring quarantine warning, independent of Compose so it can be
 * unit tested. `error` records only the last synchronization attempt; it never proves that a
 * previously confirmed data-integrity issue was resolved.
 */
data class RecurringIssueState(
    val affectedTemplates: Int,
    val error: Boolean,
    val syncing: Boolean,
) {
    /** True when at least one template is confirmed quarantined. */
    val quarantineConfirmed: Boolean get() = affectedTemplates > 0

    /** Show the warning whenever a confirmed issue exists, whatever the last sync outcome was. */
    val showWarning: Boolean get() = quarantineConfirmed

    /** A pass may only be reported as fully healthy when it succeeded and nothing is quarantined. */
    val fullyReconciled: Boolean get() = !error && !syncing && !quarantineConfirmed
}

fun recurringIssueState(issues: List<RecurringIssue>, error: Boolean, syncing: Boolean): RecurringIssueState {
    val affected = LinkedHashSet<String>()
    for (issue in issues) affected += issue.templateId
    return RecurringIssueState(affectedTemplates = affected.size, error = error, syncing = syncing)
}
