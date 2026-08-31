package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoryValidatorTest {

    @Test
    fun `sanitize trims whitespace and strips trailing semicolons and arrows`() {
        assertEquals("aus", CategoryValidator.sanitize("aus;"))
        assertEquals("shpn", CategoryValidator.sanitize("shpn;"))
        assertEquals("shopping", CategoryValidator.sanitize("  shopping;  "))
        assertEquals("groceries", CategoryValidator.sanitize("groceries:::"))
        assertEquals("", CategoryValidator.sanitize("--->"))
        assertEquals("", CategoryValidator.sanitize(";;;"))
        assertEquals("Food & Dining", CategoryValidator.sanitize("  Food   &   Dining  "))
    }

    @Test
    fun `isValid accepts standard valid categories`() {
        assertTrue(CategoryValidator.isValid("Groceries"))
        assertTrue(CategoryValidator.isValid("Food & Drinks"))
        assertTrue(CategoryValidator.isValid("Health/Medical"))
        assertTrue(CategoryValidator.isValid("Auto (Fuel)"))
        assertTrue(CategoryValidator.isValid("Café"))
        assertTrue(CategoryValidator.isValid("Überweisung"))
        assertTrue(CategoryValidator.isValid("E-Commerce"))
        assertTrue(CategoryValidator.isValid("50% Sale"))
        assertTrue(CategoryValidator.isValid("A"))
    }

    @Test
    fun `isValid sanitizes raw strings and accepts cleaned valid words`() {
        assertTrue(CategoryValidator.isValid("aus;"))
        assertTrue(CategoryValidator.isValid("shpn;"))
        assertEquals("aus", CategoryValidator.sanitize("aus;"))
        assertEquals("shpn", CategoryValidator.sanitize("shpn;"))
    }

    @Test
    fun `isValid rejects pure junk and symbols`() {
        assertFalse(CategoryValidator.isValid(""))
        assertFalse(CategoryValidator.isValid("   "))
        assertFalse(CategoryValidator.isValid("--->"))
        assertFalse(CategoryValidator.isValid(";;;"))
        assertFalse(CategoryValidator.isValid(":::"))
        assertFalse(CategoryValidator.isValid("->"))
        assertFalse(CategoryValidator.isValid("___"))
        assertFalse(CategoryValidator.isValid("..."))
        assertFalse(CategoryValidator.isValid(null))
    }

    @Test
    fun `isValid enforces 80 character limit`() {
        val maxValid = "a".repeat(80)
        assertTrue(CategoryValidator.isValid(maxValid))

        val tooLong = "a".repeat(81)
        val sanitizedTooLong = CategoryValidator.sanitize(tooLong)
        assertEquals(80, sanitizedTooLong.length)
    }

    // -- isRulesWritable: the reorder pre-flight screen (AUS-105) --
    //
    // A reorder is one atomic batch across a whole transaction type -- correctly, since a
    // per-document retry would leave the type half-renumbered. The cost is that one row
    // firestore.rules refuses takes the batch with it, so reordering failed permanently
    // behind a generic message that named nothing. Screening first makes the row nameable.

    private fun writable(
        name: String? = "Groceries",
        iconName: String? = "shopping_cart",
        colorInt: Int = -2345678,
        transactionType: String? = "expense",
        sortOrder: Int = 0,
    ) = CategoryValidator.isRulesWritable(name, iconName, colorInt, transactionType, sortOrder)

    @Test
    fun `isRulesWritable accepts a well-formed category`() {
        assertTrue(writable())
    }

    @Test
    fun `isRulesWritable accepts legacy names the name validator rejects`() {
        // The rules only bound length. Rejecting these would freeze rows the server
        // accepts, which is the opposite of the problem being solved.
        assertTrue(writable(name = "--->"))
        assertTrue(writable(name = ";;;"))
    }

    @Test
    fun `isRulesWritable rejects the blank name and icon that break a reorder batch`() {
        assertFalse(writable(name = ""))
        assertFalse(writable(name = null))
        assertFalse(writable(iconName = ""))
        assertFalse(writable(iconName = null))
    }

    @Test
    fun `isRulesWritable rejects an out-of-enum transactionType`() {
        assertFalse(writable(transactionType = "Expense"))
        assertFalse(writable(transactionType = "savings"))
        assertFalse(writable(transactionType = null))
    }

    @Test
    fun `isRulesWritable counts characters not UTF-16 units so emoji names survive`() {
        // A smiling-face emoji is two chars in a Kotlin String but one character to
        // firestore.rules size(). Counting length would reject 50 of them as "100",
        // turning this guard into the very failure it prevents.
        val emoji = String(Character.toChars(0x1F642))
        assertTrue(writable(name = emoji.repeat(50)))
        assertTrue(writable(name = emoji.repeat(80)))
        assertFalse(writable(name = emoji.repeat(81)))
    }

    @Test
    fun `isRulesWritable enforces the rules bounds on length and sortOrder`() {
        assertTrue(writable(name = "n".repeat(80)))
        assertFalse(writable(name = "n".repeat(81)))
        assertTrue(writable(iconName = "i".repeat(63)))
        assertFalse(writable(iconName = "i".repeat(64)))
        assertFalse(writable(sortOrder = -1))
        assertFalse(writable(sortOrder = 10000))
        assertTrue(writable(sortOrder = 9999))
    }
}
