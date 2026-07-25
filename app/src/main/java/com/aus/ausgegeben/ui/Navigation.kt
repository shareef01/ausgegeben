package com.aus.ausgegeben.ui

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable
sealed interface Route : NavKey {
    /** Add / edit transaction overlay */
    @Serializable
    data object AddTransaction : Route

    /** Record / transaction list tab */
    @Serializable
    data object ExpenseList : Route

    /** Settings tab */
    @Serializable
    data object Settings : Route

    /** Insights / analytics tab */
    @Serializable
    data object Insights : Route

    /** Category CRUD overlay */
    @Serializable
    data object CategoryList : Route
}

val MainTabRoutes = listOf(
    Route.ExpenseList,
    Route.Insights,
    Route.Settings
)

fun Route.isMainTab(): Boolean = this in MainTabRoutes
