package com.aus.ausgegeben.ui

sealed interface Route {
    /** Add / edit transaction overlay */
    data object AddTransaction : Route

    /** Record / transaction list tab */
    data object ExpenseList : Route

    /** Settings tab */
    data object Settings : Route

    /** Insights / analytics tab */
    data object Insights : Route

    /** Category CRUD overlay */
    data object CategoryList : Route
}

val MainTabRoutes = listOf(
    Route.ExpenseList,
    Route.Insights,
    Route.Settings
)
