package com.aus.ausgegeben.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Strict 8dp-grid padding system */
object AppSpacing {
    val xxs = 4.dp
    val xs = 8.dp
    val sm = 12.dp
    val md = 16.dp
    /** Double vertical padding for distinct visual sections */
    val lg = 32.dp
    val xl = 48.dp
    val xxl = 64.dp
}

object AppIconSize {
    val sm = 18.dp
    val md = 20.dp
    val lg = 24.dp
    /** Settings Icon Frame */
    val frame = 36.dp
}

object AppRadius {
    val xs = 4.dp
    val sm = 8.dp
    val md = 10.dp
    /** Primary content cards */
    val card = 16.dp
    val cardLarge = 20.dp
    /** Interactive elements */
    val interactive = 12.dp
    /** Dropdown menus */
    val lg = 14.dp
    /** Bottom sheets and modals */
    val xl = 28.dp
    /** Bottom sheets */
    val sheet = 24.dp
    val pill = 100.dp
}

object AppElevation {
    /** Ultra-thin hairline border (1dp) */
    val cardBorder = 1.dp
    val hairline = 0.5.dp
    val popup = 6.dp
    val modal = 12.dp
}

object AppLayoutTokens {
    val listSeparatorInset = 0.dp
    val fabClearance = 80.dp
}

object AppShadowColor {
    val ambientDark = Color(0x66000000)
    val spotDark = Color(0x99000000)
    val ambientLight = Color(0x0A000000)
    val spotLight = Color(0x1F000000)
    val modalBorderLight = Color(0x1A000000)
}
