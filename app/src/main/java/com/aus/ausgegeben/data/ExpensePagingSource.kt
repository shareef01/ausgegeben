package com.aus.ausgegeben.data

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Expense

class ExpensePagingSource(
    private val expenseDao: ExpenseDao,
    private val queryParams: ExpenseQueryParams
) : PagingSource<Int, Expense>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, Expense> {
        return try {
            val page = params.key ?: 0
            val pageSize = params.loadSize
            val items = expenseDao.getExpensesPage(
                startMillis = queryParams.startMillis,
                endMillis = queryParams.endMillis,
                typeFilter = queryParams.typeFilter,
                searchPattern = queryParams.searchPattern,
                limit = pageSize,
                offset = page * pageSize
            )
            LoadResult.Page(
                data = items,
                prevKey = if (page == 0) null else page - 1,
                nextKey = if (items.size < pageSize) null else page + 1
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, Expense>): Int? {
        return state.anchorPosition?.let { anchor ->
            val closest = state.closestPageToPosition(anchor)
            closest?.prevKey?.plus(1) ?: closest?.nextKey?.minus(1)
        }
    }
}
