package com.aus.ausgegeben.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The main tab is restored from `rememberSaveable` after an Activity recreation.
 * A key that does not round-trip would silently land the user on the wrong tab (or
 * crash on `valueOf`), so the mapping is pinned here rather than only exercised on a
 * device.
 */
class NavigationTest {

    @Test
    fun everyMainTabRoundTripsThroughItsStoredKey() {
        for (route in MainTabRoutes) {
            assertEquals(route, mainTabFromStorageKey(route.storageKey))
        }
    }

    @Test
    fun keysAreStableAndDistinct() {
        assertEquals(listOf("record", "insights", "settings"), MainTabRoutes.map { it.storageKey })
        assertEquals(Route.AddTransaction.storageKey, "add")
        assertEquals(Route.CategoryList.storageKey, "categories")
        assertEquals(MainTabRoutes.size, MainTabRoutes.map { it.storageKey }.toSet().size)
    }

    @Test
    fun unknownOrMissingKeysFallBackToRecord() {
        assertEquals(Route.ExpenseList, mainTabFromStorageKey(null))
        assertEquals(Route.ExpenseList, mainTabFromStorageKey(""))
        assertEquals(Route.ExpenseList, mainTabFromStorageKey("something-else"))
        // Overlay routes are not tabs: restoring one must not strand the shell on a tab
        // that has no navigation destination.
        assertEquals(Route.ExpenseList, mainTabFromStorageKey(Route.AddTransaction.storageKey))
        assertEquals(Route.ExpenseList, mainTabFromStorageKey(Route.CategoryList.storageKey))
    }
}
