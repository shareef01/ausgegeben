package com.aus.ausgegeben.ui

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
sealed interface Route : NavKey {
    /** Add transaction screen */
    @Serializable
    data object Dashboard : Route

    /** Record / transaction list */
    @Serializable
    data object ExpenseList : Route

    /** Settings */
    @Serializable
    data object Settings : Route

    /** Bills / analytics */
    @Serializable
    data object CategoryManagement : Route

    /** Category CRUD */
    @Serializable
    data object CategoryList : Route

    /** Receipt camera */
    @Serializable
    data object Camera : Route
}

val MainTabRoutes = listOf(
    Route.ExpenseList,
    Route.CategoryManagement,
    Route.Settings
)

fun Route.isMainTab(): Boolean = this in MainTabRoutes
