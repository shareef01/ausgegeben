package com.aus.ausgegeben.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R

val InterFontFamily = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold)
)

private val BaseTypography = Typography(
    /** Massive Hero Balance */
    displayLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 52.sp,
        lineHeight = 64.sp,
        letterSpacing = (-1.5).sp,
        fontFeatureSettings = "tnum, lnum"
    ),
    headlineLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-1.0).sp,
        fontFeatureSettings = "tnum, lnum"
    ),
    headlineMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.5).sp,
        fontFeatureSettings = "tnum, lnum"
    ),
    titleLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.3).sp
    ),
    titleMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        fontFeatureSettings = "tnum"
    ),
    bodyMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontFeatureSettings = "tnum"
    ),
    bodySmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = "tnum"
    ),
    labelLarge = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    ),
    labelMedium = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.3.sp
    ),
    /** Tiny metadata labels — not for section headers */
    labelSmall = TextStyle(
        fontFamily = InterFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 10.sp,
        lineHeight = 13.sp,
        letterSpacing = 0.4.sp
    )
)

/**
 * Long German words broke at any letter at large text on a narrow phone ("kontaktiere / n",
 * "eingenomm / en"). With hyphenation on they break at a syllable, with a hyphen. It only
 * applies to a word that has to break; digits are never hyphenated.
 */
val Typography = BaseTypography.run {
    copy(
        displayLarge = displayLarge.hyphenated(),
        displayMedium = displayMedium.hyphenated(),
        displaySmall = displaySmall.hyphenated(),
        headlineLarge = headlineLarge.hyphenated(),
        headlineMedium = headlineMedium.hyphenated(),
        headlineSmall = headlineSmall.hyphenated(),
        titleLarge = titleLarge.hyphenated(),
        titleMedium = titleMedium.hyphenated(),
        titleSmall = titleSmall.hyphenated(),
        bodyLarge = bodyLarge.hyphenated(),
        bodyMedium = bodyMedium.hyphenated(),
        bodySmall = bodySmall.hyphenated(),
        labelLarge = labelLarge.hyphenated(),
        labelMedium = labelMedium.hyphenated(),
        labelSmall = labelSmall.hyphenated(),
    )
}

private fun TextStyle.hyphenated() = copy(hyphens = Hyphens.Auto)

val AmountTextStyle = TextStyle(
    fontFamily = InterFontFamily,
    fontWeight = FontWeight.SemiBold,
    fontFeatureSettings = "tnum, lnum",
)

/**
 * Shared style for section headings and supporting metadata.
 *
 * 12sp SemiBold with near-zero tracking (was 11sp Bold at 1.5sp). The all-caps-with-tracking
 * treatment this style was built around is what the UI/UX design spec rules out for information a
 * user must read; call sites that still `.uppercase()` it are queued for the screen-by-screen pass,
 * and this alone makes every one of them denser and easier to read.
 */
val SectionLabelStyle = TextStyle(
    fontFamily = InterFontFamily,
    hyphens = Hyphens.Auto,
    fontSize = 12.sp,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = 0.2.sp,
)
