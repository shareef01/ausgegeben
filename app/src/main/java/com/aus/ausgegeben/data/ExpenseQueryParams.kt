package com.aus.ausgegeben.data

data class ExpenseQueryParams(
    val startMillis: Long,
    val endMillis: Long,
    val typeFilter: String = "",
) {
    companion object {
        fun forPeriod(
            startMillis: Long,
            endMillis: Long,
            typeFilter: TransactionTypeFilterKey = TransactionTypeFilterKey.ALL,
        ): ExpenseQueryParams = ExpenseQueryParams(
            startMillis = startMillis,
            endMillis = endMillis,
            typeFilter = typeFilter.storageValue,
        )
    }
}

enum class TransactionTypeFilterKey(val storageValue: String) {
    ALL(""),
    EXPENSE("expense"),
    INCOME("income"),
    TRANSFER("transfer")
}
