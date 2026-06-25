package com.aus.ausgegeben.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.ui.theme.AmountTextStyle

enum class MoneySize {
    Body,
    Title,
    Headline,
    Display,
    Hero
}

@Composable
fun MoneyText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    size: MoneySize = MoneySize.Body,
    fontWeight: FontWeight? = null,
    fontSize: TextUnit? = null
) {
    val base = when (size) {
        MoneySize.Body -> MaterialTheme.typography.bodyMedium
        MoneySize.Title -> MaterialTheme.typography.titleMedium
        MoneySize.Headline -> MaterialTheme.typography.headlineMedium
        MoneySize.Display -> MaterialTheme.typography.displayLarge.copy(fontSize = 44.sp, lineHeight = 48.sp)
        MoneySize.Hero -> MaterialTheme.typography.displayLarge.copy(fontSize = 52.sp, lineHeight = 56.sp)
    }
    val weight = fontWeight ?: when (size) {
        MoneySize.Hero, MoneySize.Display, MoneySize.Headline -> FontWeight.Bold
        MoneySize.Title -> FontWeight.SemiBold
        MoneySize.Body -> FontWeight.SemiBold
    }
    val letterSpacing = when (size) {
        MoneySize.Hero -> (-1.2).sp
        MoneySize.Display -> (-1.0).sp
        MoneySize.Headline -> (-0.6).sp
        MoneySize.Title -> (-0.35).sp
        MoneySize.Body -> (-0.25).sp
    }
    val resolvedSize = fontSize ?: base.fontSize
    val style: TextStyle = base.merge(AmountTextStyle).copy(
        fontWeight = weight,
        letterSpacing = letterSpacing,
        fontSize = resolvedSize,
        lineHeight = resolvedSize * 1.1f
    )
    Text(
        text = text,
        modifier = modifier,
        style = style,
        color = color
    )
}
