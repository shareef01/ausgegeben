package com.aus.ausgegeben.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
    fontSize: TextUnit? = null,
    animateChanges: Boolean = false,
    maxLines: Int = 1,
) {
    val base = when (size) {
        MoneySize.Body -> MaterialTheme.typography.bodyMedium
        MoneySize.Title -> MaterialTheme.typography.titleMedium
        MoneySize.Headline -> MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp, lineHeight = 30.sp)
        MoneySize.Display -> MaterialTheme.typography.displayLarge.copy(fontSize = 42.sp, lineHeight = 46.sp)
        MoneySize.Hero -> MaterialTheme.typography.displayLarge.copy(fontSize = 50.sp, lineHeight = 54.sp)
    }
    val weight = fontWeight ?: when (size) {
        MoneySize.Hero -> FontWeight.SemiBold
        MoneySize.Display, MoneySize.Headline -> FontWeight.SemiBold
        MoneySize.Title -> FontWeight.Medium
        MoneySize.Body -> FontWeight.Medium
    }
    val letterSpacing = when (size) {
        MoneySize.Hero -> (-1.35).sp
        MoneySize.Display -> (-1.1).sp
        MoneySize.Headline -> (-0.7).sp
        MoneySize.Title -> (-0.3).sp
        MoneySize.Body -> (-0.15).sp
    }
    val resolvedSize = fontSize ?: base.fontSize
    val style: TextStyle = base.merge(AmountTextStyle).copy(
        fontWeight = weight,
        letterSpacing = letterSpacing,
        fontSize = resolvedSize,
        lineHeight = resolvedSize * 1.06f
    )
    if (animateChanges) {
        AnimatedContent(
            targetState = text,
            transitionSpec = {
                fadeIn(animationSpec = tween(160)) togetherWith
                    fadeOut(animationSpec = tween(120)) using
                    SizeTransform(clip = false)
            },
            label = "moneyText"
        ) { value ->
            MoneyTextContent(
                text = value,
                modifier = modifier,
                style = style,
                color = color,
                maxLines = maxLines,
            )
        }
    } else {
        MoneyTextContent(
            text = text,
            modifier = modifier,
            style = style,
            color = color,
            maxLines = maxLines,
        )
    }
}

@Composable
private fun MoneyTextContent(
    text: String,
    modifier: Modifier,
    style: TextStyle,
    color: Color,
    maxLines: Int,
) {
    Text(
        text = text,
        modifier = modifier,
        style = style,
        color = color,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}
