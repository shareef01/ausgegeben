package com.aus.ausgegeben.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes

val GroupedShape = RoundedCornerShape(AppRadius.card)
val GlassShape = RoundedCornerShape(AppRadius.cardLarge)
val CapsuleShape = RoundedCornerShape(AppRadius.pill)
val AppSheetShape = RoundedCornerShape(topStart = AppRadius.sheet, topEnd = AppRadius.sheet)

internal val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(AppRadius.sm),
    small = RoundedCornerShape(AppRadius.md),
    medium = RoundedCornerShape(AppRadius.card),
    large = RoundedCornerShape(AppRadius.cardLarge),
    extraLarge = RoundedCornerShape(AppRadius.cardLarge)
)
