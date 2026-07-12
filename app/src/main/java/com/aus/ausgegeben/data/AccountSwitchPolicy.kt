package com.aus.ausgegeben.data

/** True when a different Firebase user signs in and local Room data must be cleared first. */
fun shouldClearLocalDataBeforeSync(lastCloudUserId: String?, nextUid: String): Boolean =
    !lastCloudUserId.isNullOrBlank() && lastCloudUserId != nextUid
