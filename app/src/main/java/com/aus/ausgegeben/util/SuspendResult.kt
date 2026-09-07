package com.aus.ausgegeben.util

import kotlinx.coroutines.CancellationException

/** Result wrapper for suspend work that preserves structured coroutine cancellation. */
suspend inline fun <T> runSuspendCatching(crossinline block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Result.failure(error)
    }
