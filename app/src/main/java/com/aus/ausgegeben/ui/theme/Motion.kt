package com.aus.ausgegeben.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring

val AppSpring = spring<Float>(
    dampingRatio = Spring.DampingRatioLowBouncy,
    stiffness = Spring.StiffnessMediumLow
)

val AppSpringSnappy = spring<Float>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessHigh
)

val AppChartSpring = spring<Float>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessMediumLow
)

/** Smooth chart reveal tuned for high-refresh displays */
val AppChartRevealSpring = spring<Float>(
    dampingRatio = Spring.DampingRatioLowBouncy,
    stiffness = Spring.StiffnessMedium
)

val AppDpSpring = spring<androidx.compose.ui.unit.Dp>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessHigh
)

val AppColorSpring = spring<androidx.compose.ui.graphics.Color>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessHigh
)
