package com.aus.ausgegeben.data

data class ExpenseQueryParams(
    val startMillis: Long,
    val endMillis: Long,
    val typeFilter: String = "",
    val searchPattern: String = ""
) {
    companion object {
        fun forPeriod(
            startMillis: Long,
            endMillis: Long,
            typeFilter: TransactionTypeFilterKey = TransactionTypeFilterKey.ALL,
            searchQuery: String = ""
        ): ExpenseQueryParams = ExpenseQueryParams(
            startMillis = startMillis,
            endMillis = endMillis,
            typeFilter = typeFilter.storageValue,
            searchPattern = searchQuery.trim().lowercase().let { q ->
                if (q.isEmpty()) "" else "%$q%"
            }
        )
    }
}

enum class TransactionTypeFilterKey(val storageValue: String) {
    ALL(""),
    EXPENSE("expense"),
    INCOME("income"),
    TRANSFER("transfer")
}
