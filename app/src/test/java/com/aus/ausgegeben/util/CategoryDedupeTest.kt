package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category
import org.junit.Assert.assertEquals
import org.junit.Test

class CategoryDedupeTest {

    @Test
    fun pickMaster_prefersLowestSortOrder() {
        val a = Category(id = "b", name = "Food", iconName = "x", colorInt = 1, sortOrder = 2)
        val b = Category(id = "a", name = "Food", iconName = "x", colorInt = 1, sortOrder = 0)
        assertEquals("a", CategoryDedupe.pickMaster(listOf(a, b)).id)
    }

    @Test
    fun pickMaster_tiesBreakOnId() {
        val a = Category(id = "zzz", name = "Food", iconName = "x", colorInt = 1, sortOrder = 1)
        val b = Category(id = "aaa", name = "Food", iconName = "x", colorInt = 1, sortOrder = 1)
        assertEquals("aaa", CategoryDedupe.pickMaster(listOf(a, b)).id)
    }
}
