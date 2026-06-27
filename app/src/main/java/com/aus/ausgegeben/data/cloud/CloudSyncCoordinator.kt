package com.aus.ausgegeben.data.cloud

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Coalesces cloud sync requests so resume + launch do not double-pull,
 * and enforces a minimum interval between automatic background syncs.
 */
class CloudSyncCoordinator(
    private val minIntervalMs: Long = 5 * 60 * 1000L,
) {
    private val mutex = Mutex()
    private var lastCompletedAt = 0L

    suspend fun fullSync(
        repository: CloudSyncRepository,
        force: Boolean = false,
    ): Result<Unit> {
        if (!force && System.currentTimeMillis() - lastCompletedAt < minIntervalMs) {
            return Result.success(Unit)
        }
        return mutex.withLock {
            if (!force && System.currentTimeMillis() - lastCompletedAt < minIntervalMs) {
                return@withLock Result.success(Unit)
            }
            repository.fullSync().also { result ->
                if (result.isSuccess) {
                    lastCompletedAt = System.currentTimeMillis()
                }
            }
        }
    }
}
