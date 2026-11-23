package com.aus.ausgegeben.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
    initialTab: Route = Route.ExpenseList,
) {
    var selectedTab by mutableStateOf(initialTab)
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
        overlayStack.add(Route.AddTransaction)
    }

    fun openEditFlow(expense: Expense, ownerUid: String? = null) {
        addViewModel.loadForEdit(expense, expenseViewModel.uiState.value.data.categories, ownerUid)
        overlayStack.clear()
        overlayStack.add(Route.AddTransaction)
    }
}

/**
 * Builds the overlay state and persists the selected main tab across Activity recreation.
 *
 * The filter/search state already lives in [ExpenseViewModel], which survives a
 * configuration change; the tab itself was plain `remember` and reset to Record on every
 * rotation. `rememberSaveable` also carries it through process death. Overlays (the add
 * sheet, category list) are deliberately not persisted: their draft lives in a ViewModel
 * that process death discards, so reopening an empty sheet would be worse than closing it.
 */
@Composable
fun rememberAppOverlayState(
    addViewModel: AddExpenseViewModel,
    expenseViewModel: ExpenseViewModel,
): AppOverlayState {
    var savedTabKey by rememberSaveable { mutableStateOf(Route.ExpenseList.storageKey) }
    val state = remember(addViewModel, expenseViewModel) {
        AppOverlayState(addViewModel, expenseViewModel, mainTabFromStorageKey(savedTabKey))
    }
    LaunchedEffect(state.selectedTab) {
        savedTabKey = state.selectedTab.storageKey
    }
    return state
}
