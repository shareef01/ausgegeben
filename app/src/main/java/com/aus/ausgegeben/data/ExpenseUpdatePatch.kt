package com.aus.ausgegeben.data

/**
 * The fields an edit must write (AUS-104). Mirrors web `expenseUpdatePatch`.
 *
 * An edit used to send the whole row, so two devices editing different fields of one
 * transaction lost one of the changes: A changes the note, B changes the amount, and
 * whichever saved second wrote its stale copy of the other field too. Now an edit sends
 * only what changed against the values the editor loaded ([original]). Firestore's
 * update merges, so the other device's field survives. Edits to the same field are
 * still last-writer-wins.
 *
 * - A field is also sent when its stored value is missing or has the wrong type (a
 *   legacy row), because the full write used to normalize that shape.
 * - categoryId and transactionType travel together: rules require them to match, and
 *   sending one alone could pair it with a type the other device just changed.
 * - With no [original], every field is sent, as before.
 *
 * Inputs are canonical field maps ([canonicalExpenseFields]); [stored] is the raw
 * document. The result may be empty: nothing changed, so there is nothing to write.
 */
internal fun expenseUpdatePatch(
    edited: Map<String, Any?>,
    original: Map<String, Any?>?,
    stored: Map<String, Any?>,
): Map<String, Any?> {
    val patch = linkedMapOf<String, Any?>()
    for (key in EDITABLE_EXPENSE_FIELDS) {
        val changed = original == null || edited[key] != original[key]
        val legacyShape = valueKind(stored[key]) != valueKind(edited[key])
        if (changed || legacyShape) patch[key] = edited[key]
    }
    if ("categoryId" in patch || "transactionType" in patch) {
        patch["categoryId"] = edited["categoryId"]
        patch["transactionType"] = edited["transactionType"]
    }
    return patch
}

internal val EDITABLE_EXPENSE_FIELDS = listOf("amount", "dateMillis", "categoryId", "note", "transactionType")

/** Firestore numbers read back as Long or Double; both count as a number. */
private fun valueKind(value: Any?): String = when (value) {
    null -> "missing"
    is Number -> "number"
    is String -> "string"
    else -> value::class.java.simpleName
}
