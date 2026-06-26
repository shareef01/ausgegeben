package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object AppSpacing {
    val xxs = 4.dp
    val xs = 8.dp
    val sm = 12.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
    val xxl = 40.dp
}

object AppIconSize {
    val sm = 18.dp
    val md = 20.dp
    val lg = 24.dp
}

object AppRadius {
    val xs = 4.dp
    val card = 12.dp
    val cardLarge = 16.dp
    val sm = 6.dp
    val md = 10.dp
    val lg = 12.dp
    val xl = 16.dp
    val pill = 50.dp
}

object AppElevation {
    /** User spec: 1px solid rgba(255,255,255,0.08) */
    val cardBorder = 1.dp
    val glassBorder = 1.dp
    /** Premium diffuse shadow for dropdowns / popovers */
    val popup = 10.dp
    /** Elevated modal sheets */
    val modal = 16.dp
}

/** Light-mode popup shadow — soft diffuse (matches CSS box-shadow spec) */
object AppShadowColor {
    val ambientLight = Color(0x0D000000) // rgba(0,0,0,0.05)
    val spotLight = Color(0x03000000) // rgba(0,0,0,0.01)
    val modalBorderLight = Color(0x0D000000) // rgba(0,0,0,0.05)
    val ambientDark = Color(0x59000000)
    val spotDark = Color(0x40000000)
}

/** Frosted-glass gradient stop alphas for hero cards */
object AppGradientAlpha {
    val incomeSoft = 0.08f
    val expenseSoft = 0.06f
    val incomeMedium = 0.09f
    val expenseMedium = 0.07f
    val incomeSubtle = 0.07f
}

object AppListItem {
    /** Settings rows & modal selection items */
    val rowVertical = 16.dp
    val selectionOuterVertical = 8.dp
    val selectionInnerVertical = 16.dp
}

object AppProgressBar {
    val flowBalanceHeight = 5.dp
}

object AppLayoutTokens {
    val listSeparatorInset = 52.dp
    val emptyStateIconWell = 48.dp
    val emptyStateMinHeight = 200.dp
    val fabClearance = 64.dp
    val stripeWidth = 0.dp
}
