package com.aus.ausgegeben.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.aus.ausgegeben.data.entity.Expense

/**
 * Manages overlay navigation (add transaction, category list)
 * and the main tab selection state. Extracted from [MainApp] to keep
 * the composable lean.
 */
@Stable
class AppOverlayState(
    val addViewModel: AddExpenseViewModel,
    val expenseViewModel: ExpenseViewModel,
) {
    var selectedTab by mutableStateOf<Route>(Route.ExpenseList)
    val overlayStack = mutableStateListOf<Route>()

    val currentOverlay: Route? get() = overlayStack.lastOrNull()
    val showBottomNav: Boolean get() = overlayStack.isEmpty()

    fun closeOverlay() {
        overlayStack.clear()
    }

    fun popOverlay() {
        if (overlayStack.size <= 1) {
            closeOverlay()
        } else {
            overlayStack.removeLastOrNull()
        }
    }

    fun openAddFlow() {
        addViewModel.resetForm()
        overlayStack.clear()
        overlayStack.add(Route.Dashboard)
    }

    fun openEditFlow(expense: Expense) {
        addViewModel.loadForEdit(expense, expenseViewModel.uiState.value.data.categories)
        overlayStack.clear()
        overlayStack.add(Route.Dashboard)
    }
}

@Composable
fun rememberAppOverlayState(
    addViewModel: AddExpenseViewModel,
    expenseViewModel: ExpenseViewModel,
): AppOverlayState {
    return remember(addViewModel, expenseViewModel) {
        AppOverlayState(addViewModel, expenseViewModel)
    }
}
