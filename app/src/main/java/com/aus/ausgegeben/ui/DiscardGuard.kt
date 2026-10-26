package com.aus.ausgegeben.ui

/**
 * Whether closing the transaction form must ask for confirmation.
 *
 * [dirty] is deliberately a supplier, not a Boolean: the decision has to be evaluated
 * when the user actually closes the form. Evaluating it during composition and
 * capturing the result is exactly the defect that let an edited transaction close
 * without a prompt — a note/amount change updates the view model, but does not
 * necessarily re-run the composition that produced the captured value. The runtime
 * evidence was a log line reading `captured=false recomputed=true`.
 *
 * While the edit is still loading the form shows a spinner, so nothing can have been
 * typed and closing is always safe.
 */
internal fun discardPromptRequired(isLoading: Boolean, dirty: () -> Boolean): Boolean =
    !isLoading && dirty()
