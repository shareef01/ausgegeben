package com.aus.ausgegeben.ui

import com.aus.ausgegeben.data.entity.Category
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reordering silently did nothing on a real account. Both causes were in this
 * pure list logic, so it is tested here rather than through the ViewModel.
 */
class CategoryReorderTest {

    private fun cat(id: String, order: Int, type: String = "expense") =
        Category(id = id, name = id, iconName = "tag", colorInt = -1, transactionType = type, sortOrder = order)

    /** Apply the returned changes and read back the resulting visible order. */
    private fun orderAfter(all: List<Category>, moved: Category, up: Boolean, type: String = "expense"): List<String> {
        val changes = categoriesAfterMove(all, moved, up).associateBy { it.id }
        return all
            .map { changes[it.id] ?: it }
            .filter { it.transactionType == type && it.id != "0" }
            .sortedWith(compareBy({ it.sortOrder }, { it.id }))
            .map { it.id }
    }

    @Test
    fun movesOnePlaceUp() {
        val all = listOf(cat("a", 0), cat("b", 1), cat("c", 2))
        assertEquals(listOf("a", "c", "b"), orderAfter(all, all[2], up = true))
    }

    @Test
    fun movesOnePlaceDown() {
        val all = listOf(cat("a", 0), cat("b", 1), cat("c", 2))
        assertEquals(listOf("b", "a", "c"), orderAfter(all, all[0], up = false))
    }

    @Test
    fun doesNothingAtTheEnds() {
        val all = listOf(cat("a", 0), cat("b", 1))
        assertTrue(categoriesAfterMove(all, all[0], moveUp = true).isEmpty())
        assertTrue(categoriesAfterMove(all, all[1], moveUp = false).isEmpty())
    }

    /**
     * The sentinel is hidden by CategoryScreen but used to be counted here, so a
     * category on the far side of it swapped with an invisible row and the screen
     * did not change. Its sortOrder of 999 put it mid-list on a real account.
     */
    @Test
    fun ignoresTheUncategorizedSentinel() {
        val all = listOf(
            cat("health", 11),
            cat("0", 999),          // Uncategorized — hidden in the UI
            cat("groceries", 1000),
        )
        assertEquals(
            listOf("groceries", "health"),
            orderAfter(all, all[2], up = true),
        )
    }

    @Test
    fun neverRenumbersTheSentinel() {
        val all = listOf(cat("a", 0), cat("0", 999), cat("b", 1000))
        val changed = categoriesAfterMove(all, all[2], moveUp = true)
        assertTrue(changed.none { it.id == "0" })
    }

    /**
     * Swapping two sortOrder values is a no-op when they are equal. One account had
     * two categories at 1000, so the pair could never be reordered.
     */
    @Test
    fun reordersDespiteDuplicateSortOrders() {
        val all = listOf(cat("groceries", 1000), cat("shopping", 1000))
        // groceries sorts first on the id tie-break; moving it down must swap them.
        assertEquals(listOf("shopping", "groceries"), orderAfter(all, all[0], up = false))
    }

    @Test
    fun normalisesDuplicatesAndGapsIntoSequentialOrder() {
        val all = listOf(cat("a", 2), cat("b", 9), cat("c", 9), cat("d", 1000))
        val result = all
            .map { c -> categoriesAfterMove(all, all[0], moveUp = false).find { it.id == c.id } ?: c }
            .sortedWith(compareBy({ it.sortOrder }, { it.id }))
        assertEquals(listOf(0, 1, 2, 3), result.map { it.sortOrder })
    }

    @Test
    fun leavesOtherTransactionTypesAlone() {
        val all = listOf(
            cat("e1", 0), cat("e2", 1),
            cat("i1", 0, "income"), cat("i2", 1, "income"),
        )
        val changed = categoriesAfterMove(all, all[1], moveUp = true)
        assertTrue(changed.none { it.transactionType == "income" })
    }

    @Test
    fun returnsOnlyRowsThatActuallyChange() {
        val all = listOf(cat("a", 0), cat("b", 1), cat("c", 2), cat("d", 3))
        // Swapping a and b leaves c and d already correctly numbered.
        val changed = categoriesAfterMove(all, all[0], moveUp = false)
        assertEquals(setOf("a", "b"), changed.map { it.id }.toSet())
    }
}
