package com.aus.ausgegeben.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.ui.theme.AmountTextStyle

enum class MoneySize {
    Body,
    Title,
    Headline,
    Display
}

@Composable
fun MoneyText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    size: MoneySize = MoneySize.Body,
    fontWeight: FontWeight? = null
) {
    val base = when (size) {
        MoneySize.Body -> MaterialTheme.typography.bodyMedium
        MoneySize.Title -> MaterialTheme.typography.titleMedium
        MoneySize.Headline -> MaterialTheme.typography.headlineMedium
        MoneySize.Display -> MaterialTheme.typography.displayLarge.copy(fontSize = 40.sp, lineHeight = 44.sp)
    }
    val weight = fontWeight ?: when (size) {
        MoneySize.Display, MoneySize.Headline -> FontWeight.Bold
        MoneySize.Title -> FontWeight.SemiBold
        MoneySize.Body -> FontWeight.SemiBold
    }
    val letterSpacing = when (size) {
        MoneySize.Display -> (-1.0).sp
        MoneySize.Headline -> (-0.6).sp
        MoneySize.Title -> (-0.35).sp
        MoneySize.Body -> (-0.25).sp
    }
    val style: TextStyle = base.merge(AmountTextStyle).copy(
        fontWeight = weight,
        letterSpacing = letterSpacing
    )
    Text(
        text = text,
        modifier = modifier,
        style = style,
        color = color
    )
}
