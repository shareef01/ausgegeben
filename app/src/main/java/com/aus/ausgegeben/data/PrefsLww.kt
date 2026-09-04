package com.aus.ausgegeben.data

/** Last-write-wins for `users/{uid}/settings/preferences.updatedAt`. Equal clocks are a no-op. */
enum class PrefsLwwAction {
    APPLY_REMOTE,
    PUSH_LOCAL,
    HOLD,
}

fun prefsLwwAction(remoteUpdatedAt: Long, localUpdatedAt: Long): PrefsLwwAction = when {
    remoteUpdatedAt > localUpdatedAt -> PrefsLwwAction.APPLY_REMOTE
    localUpdatedAt > remoteUpdatedAt -> PrefsLwwAction.PUSH_LOCAL
    else -> PrefsLwwAction.HOLD
}
