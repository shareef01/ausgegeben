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

/**
 * Stable, human-readable key for the selected main tab.
 *
 * Compose `remember` survives recomposition but not an Activity recreation, so rotation
 * (and process death) used to drop the user back on Record from any other tab. The key is
 * persisted with `rememberSaveable` and mapped back through [routeFromStorageKey]. It is
 * stored as a string rather than the sealed object because Bundle saving only supports
 * primitives/Serializable/Parcelable values.
 */
val Route.storageKey: String
    get() = when (this) {
        Route.ExpenseList -> "record"
        Route.Insights -> "insights"
        Route.Settings -> "settings"
        Route.AddTransaction -> "add"
        Route.CategoryList -> "categories"
    }

/** Parse a persisted tab key. Unknown/absent keys fall back to the Record tab. */
fun mainTabFromStorageKey(key: String?): Route = when (key) {
    Route.Insights.storageKey -> Route.Insights
    Route.Settings.storageKey -> Route.Settings
    else -> Route.ExpenseList
}

/** Parse a persisted overlay-stack entry. Tabs are not overlays and are not restored here. */
fun overlayRouteFromStorageKey(key: String): Route? = when (key) {
    Route.AddTransaction.storageKey -> Route.AddTransaction
    Route.CategoryList.storageKey -> Route.CategoryList
    else -> null
}

val MainTabRoutes = listOf(
    Route.ExpenseList,
    Route.Insights,
    Route.Settings
)
