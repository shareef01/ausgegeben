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
}
