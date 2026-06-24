package com.aus.ausgegeben.util

import androidx.compose.ui.graphics.Color
import com.aus.ausgegeben.ui.theme.forChartDisplay

/** Ensures full ARGB (adds opaque alpha when stored as 24-bit RGB). */
fun normalizeArgbInt(value: Int): Int =
    if (value and 0xFF000000.toInt() == 0) value or 0xFF000000.toInt() else value

/** Converts a Compose [Color] to a standard Android ARGB int for Room storage. */
fun Color.toArgbInt(): Int {
    val a = (alpha * 255f + 0.5f).toInt().coerceIn(0, 255)
    val r = (red * 255f + 0.5f).toInt().coerceIn(0, 255)
    val g = (green * 255f + 0.5f).toInt().coerceIn(0, 255)
    val b = (blue * 255f + 0.5f).toInt().coerceIn(0, 255)
    return (a shl 24) or (r shl 16) or (g shl 8) or b
}

fun colorIntToCompose(argb: Int): Color = Color(normalizeArgbInt(argb))

fun argbColorsMatch(a: Int, b: Int): Boolean =
    normalizeArgbInt(a) == normalizeArgbInt(b)

/** Icon tint that stays visible on both light and dark category fills. */
fun iconTintOnCategoryFill(categoryColor: Color): Color =
    if (relativeLuminance(categoryColor) > 0.55f) Color(0xFF1C1C22) else Color.White

private fun relativeLuminance(color: Color): Float =
    0.2126f * color.red + 0.7152f * color.green + 0.0722f * color.blue

/** Harmonized palette aligned with chart colors — distinct and pleasant together. */
val CategoryColorPaletteInts: List<Int> = listOf(
    0xFFFF8A7A.toInt(),
    0xFFFFBE7A.toInt(),
    0xFF5ED49A.toInt(),
    0xFF6EC8E8.toInt(),
    0xFF9B8FEF.toInt(),
    0xFFE89BC4.toInt(),
    0xFF7BC8B5.toInt(),
    0xFFD4A96A.toInt(),
    0xFFFF8578.toInt(),
    0xFF72AEFF.toInt(),
    0xFFA894F6.toInt(),
    0xFF5ECFC0.toInt(),
    0xFFC4A882.toInt(),
    0xFF9B9BA8.toInt(),
    0xFF6E6E78.toInt(),
    0xFF48484E.toInt()
)

val CategoryColorPalette: List<Color> = CategoryColorPaletteInts.map { colorIntToCompose(it) }

fun randomCategoryColorInt(): Int = CategoryColorPaletteInts.random()

fun nearestPaletteColorInt(argb: Int): Int {
    val target = colorIntToCompose(argb)
    return CategoryColorPalette
        .withIndex()
        .minByOrNull { (_, paletteColor) ->
            val a = paletteColor.alpha - target.alpha
            val r = paletteColor.red - target.red
            val g = paletteColor.green - target.green
            val b = paletteColor.blue - target.blue
            a * a + r * r + g * g + b * b
        }
        ?.index
        ?.let { CategoryColorPaletteInts[it] }
        ?: CategoryColorPaletteInts.first()
}

/** Fixes categories saved before the ARGB conversion bug (stored as pure black). */
fun repairStoredCategoryColor(argb: Int, categoryName: String): Int {
    val normalized = normalizeArgbInt(argb)
    if (normalized == 0 || normalized == 0xFF000000.toInt()) {
        val index = (categoryName.hashCode() and Int.MAX_VALUE) % CategoryColorPaletteInts.size
        return CategoryColorPaletteInts[index]
    }
    return normalized
}

/** Builds chart color map keyed by category name, harmonized for display. */
fun harmonizedChartColors(
    categories: List<Pair<String, Int>>
): Map<String, Color> = categories.mapIndexed { index, (name, colorInt) ->
    name to colorIntToCompose(colorInt).forChartDisplay(index)
}.toMap()
