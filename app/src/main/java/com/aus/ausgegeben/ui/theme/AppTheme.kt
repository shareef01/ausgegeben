package com.aus.ausgegeben.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/** Whether the active Material color scheme is a dark theme. */
@Composable
fun isAppDarkTheme(): Boolean =
    MaterialTheme.colorScheme.background.luminance() < 0.5f

@Composable
fun appBorderColor(): Color =
    if (isAppDarkTheme()) AppColors.CardBorder else SurfaceBorderLight

@Composable
fun appDividerColor(): Color =
    if (isAppDarkTheme()) AppColors.CardBorder else OutlineLight.copy(alpha = 0.6f)

@Composable
fun financeIncomeColor(): Color = if (isAppDarkTheme()) IncomeGreen else MaterialTheme.colorScheme.primary

@Composable
fun financeExpenseColor(): Color = MaterialTheme.colorScheme.error
