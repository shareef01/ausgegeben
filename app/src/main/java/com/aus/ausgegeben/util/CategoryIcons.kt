package com.aus.ausgegeben.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.rounded.*
import androidx.compose.ui.graphics.vector.ImageVector
import com.aus.ausgegeben.data.entity.Category

data class CategoryIconOption(
    val key: String,
    val icon: ImageVector,
    val label: String
)

val CategoryIconOptions: List<CategoryIconOption> = listOf(
    CategoryIconOption("category", Icons.Rounded.Category, "General"),
    CategoryIconOption("shopping_cart", Icons.Rounded.ShoppingCart, "Groceries"),
    CategoryIconOption("shopping_bag", Icons.Rounded.ShoppingBag, "Shopping"),
    CategoryIconOption("restaurant", Icons.Rounded.Restaurant, "Food"),
    CategoryIconOption("cafe", Icons.Rounded.LocalCafe, "Café"),
    CategoryIconOption("car", Icons.Rounded.DirectionsCar, "Transport"),
    CategoryIconOption("gas", Icons.Rounded.LocalGasStation, "Fuel"),
    CategoryIconOption("home", Icons.Rounded.Home, "Home"),
    CategoryIconOption("bolt", Icons.Rounded.Bolt, "Utilities"),
    CategoryIconOption("wifi", Icons.Rounded.Wifi, "Internet"),
    CategoryIconOption("subscriptions", Icons.Rounded.Subscriptions, "Subs"),
    CategoryIconOption("smoking", Icons.Rounded.SmokingRooms, "Tobacco"),
    CategoryIconOption("health", Icons.Rounded.MedicalServices, "Health"),
    CategoryIconOption("fitness", Icons.Rounded.FitnessCenter, "Fitness"),
    CategoryIconOption("education", Icons.Rounded.School, "Education"),
    CategoryIconOption("work", Icons.Rounded.Work, "Work"),
    CategoryIconOption("flight", Icons.Rounded.Flight, "Travel"),
    CategoryIconOption("hotel", Icons.Rounded.Hotel, "Hotel"),
    CategoryIconOption("wallet", Icons.Rounded.Wallet, "Cash"),
    CategoryIconOption("savings", Icons.Rounded.Savings, "Savings"),
    CategoryIconOption("credit_card", Icons.Rounded.CreditCard, "Card"),
    CategoryIconOption("trending_up", Icons.AutoMirrored.Rounded.TrendingUp, "Income"),
    CategoryIconOption("undo", Icons.AutoMirrored.Rounded.Undo, "Refund"),
    CategoryIconOption("swap", Icons.Rounded.SwapHoriz, "Transfer"),
    CategoryIconOption("gift", Icons.Rounded.CardGiftcard, "Gift"),
    CategoryIconOption("entertainment", Icons.Rounded.Movie, "Fun"),
    CategoryIconOption("pets", Icons.Rounded.Pets, "Pets"),
    CategoryIconOption("child", Icons.Rounded.ChildCare, "Kids"),
    CategoryIconOption("phone", Icons.Rounded.Phone, "Phone"),
    CategoryIconOption("laptop", Icons.Rounded.Laptop, "Tech"),
    CategoryIconOption("emoji_events", Icons.Rounded.EmojiEvents, "Award")
)

private val iconByKey = CategoryIconOptions.associate { it.key to it.icon }

fun iconForCategory(iconName: String?, name: String? = null): ImageVector {
    if (!iconName.isNullOrBlank()) {
        iconByKey[iconName]?.let { return it }
    }
    return iconForCategoryName(name)
}

fun iconForCategory(category: Category): ImageVector =
    iconForCategory(category.iconName, category.name)

private fun iconForCategoryName(name: String?): ImageVector = when (name) {
    "Groceries" -> Icons.Rounded.ShoppingCart
    "Shopping" -> Icons.Rounded.ShoppingBag
    "Tabak" -> Icons.Rounded.SmokingRooms
    "Abonnement" -> Icons.Rounded.Subscriptions
    "elec_vattenfall", "Utilities" -> Icons.Rounded.Bolt
    "Refunds" -> Icons.AutoMirrored.Rounded.Undo
    "Dividends" -> Icons.AutoMirrored.Rounded.TrendingUp
    "Salary" -> Icons.Rounded.CreditCard
    "Transfer", "Between Accounts" -> Icons.Rounded.SwapHoriz
    "Cash" -> Icons.Rounded.Wallet
    "Deposit" -> Icons.Rounded.Savings
    "Awards" -> Icons.Rounded.EmojiEvents
    else -> Icons.Rounded.Category
}

fun defaultIconKeyForName(name: String): String = when {
    name.contains("groc", ignoreCase = true) -> "shopping_cart"
    name.contains("shop", ignoreCase = true) -> "shopping_bag"
    name.contains("food", ignoreCase = true) || name.contains("rest", ignoreCase = true) -> "restaurant"
    name.contains("car", ignoreCase = true) || name.contains("transport", ignoreCase = true) -> "car"
    name.contains("home", ignoreCase = true) || name.contains("rent", ignoreCase = true) -> "home"
    name.contains("util", ignoreCase = true) || name.contains("elec", ignoreCase = true) -> "bolt"
    name.contains("sub", ignoreCase = true) -> "subscriptions"
    name.contains("salary", ignoreCase = true) || name.contains("pay", ignoreCase = true) -> "credit_card"
    name.contains("cash", ignoreCase = true) -> "wallet"
    name.contains("transfer", ignoreCase = true) -> "swap"
    name.contains("refund", ignoreCase = true) -> "undo"
    name.contains("dividend", ignoreCase = true) || name.contains("income", ignoreCase = true) -> "trending_up"
    name.contains("award", ignoreCase = true) -> "emoji_events"
    name.contains("health", ignoreCase = true) || name.contains("med", ignoreCase = true) -> "health"
    name.contains("travel", ignoreCase = true) || name.contains("flight", ignoreCase = true) -> "flight"
    else -> "category"
}
