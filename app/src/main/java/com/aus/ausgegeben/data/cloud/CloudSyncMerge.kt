package com.aus.ausgegeben.data.cloud

data class CloudCategoryRecord(
    val id: Long,
    val name: String,
    val iconName: String,
    val colorInt: Int,
    val transactionType: String,
    val sortOrder: Int,
    val updatedAt: Long,
    val deleted: Boolean = false,
)

data class CloudExpenseRecord(
    val id: Long,
    val amount: Double,
    val dateMillis: Long,
    val categoryId: Long,
    val note: String,
    val receiptImagePath: String?,
    val transactionType: String,
    val updatedAt: Long,
    val deleted: Boolean = false,
)

data class MergeResult<T>(
    val toApplyLocal: List<T>,
    val toPushRemote: List<T>,
    val toDeleteLocal: List<Long>,
)

fun recordTimestamp(updatedAt: Long, fallback: Long = 0L): Long =
    if (updatedAt > 0L) updatedAt else fallback

fun <T> mergeById(
    localItems: List<T>,
    remoteItems: List<T>,
    idSelector: (T) -> Long,
    updatedAtSelector: (T) -> Long,
    deletedSelector: (T) -> Boolean,
): MergeResult<T> where T : Any {
    val localMap = localItems.associateBy(idSelector)
    val remoteMap = remoteItems.associateBy(idSelector)
    val allIds = localMap.keys + remoteMap.keys

    val toApplyLocal = mutableListOf<T>()
    val toPushRemote = mutableListOf<T>()
    val toDeleteLocal = mutableListOf<Long>()

    for (id in allIds) {
        val local = localMap[id]
        val remote = remoteMap[id]

        when {
            local == null && remote != null -> {
                if (!deletedSelector(remote)) toApplyLocal += remote
            }
            local != null && remote == null -> {
                toPushRemote += local
            }
            local != null && remote != null -> {
                val localAt = updatedAtSelector(local)
                val remoteAt = updatedAtSelector(remote)
                if (deletedSelector(remote)) {
                    if (remoteAt >= localAt) toDeleteLocal += id
                    else toPushRemote += local
                } else when {
                    remoteAt > localAt -> toApplyLocal += remote
                    localAt > remoteAt -> toPushRemote += local
                    else -> toApplyLocal += remote
                }
            }
        }
    }

    return MergeResult(toApplyLocal, toPushRemote, toDeleteLocal)
}
