package com.aus.ausgegeben.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.SettingsActionRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.label
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils

@Composable
fun SettingsAppearanceSection(
    themeMode: ThemeMode,
    language: String,
    currency: String,
    onShowThemeSheet: () -> Unit,
    onShowLanguageSheet: () -> Unit,
    onShowCurrencySheet: () -> Unit,
) {
    Column {
        GroupedSectionLabel(text = stringResource(R.string.settings_section_appearance))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppSpacing.md)
                .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
        ) {
            Column {
                SettingsActionRow(
                    icon = Icons.Rounded.Palette,
                    tint = settingsIconTintAccent(),
                    title = stringResource(R.string.settings_theme).lowercase(),
                    subtitle = themeMode.label().lowercase(),
                    onClick = onShowThemeSheet,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Language,
                    tint = settingsIconTintAccent(),
                    title = stringResource(R.string.settings_language).lowercase(),
                    subtitle = if (language == "de") stringResource(R.string.lang_german).lowercase() else stringResource(R.string.lang_english).lowercase(),
                    onClick = onShowLanguageSheet,
                )
                IosSeparator(insetStart = 56.dp)
                SettingsActionRow(
                    icon = Icons.Rounded.Payments,
                    tint = settingsIconTintAccent(),
                    title = stringResource(R.string.settings_currency).lowercase(),
                    subtitle = CurrencyUtils.labelFor(currency).lowercase(),
                    onClick = onShowCurrencySheet,
                )
            }
        }
    }
}
