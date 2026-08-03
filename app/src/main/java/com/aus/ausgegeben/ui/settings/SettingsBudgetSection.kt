package com.aus.ausgegeben.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.SettingsActionRow
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils

@Composable
fun SettingsBudgetSection(
    monthlyBudget: Double?,
    currency: String,
    onShowBudgetDialog: () -> Unit,
) {
    Column {
        GroupedSectionLabel(text = stringResource(R.string.settings_section_budget))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppSpacing.md)
                .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
        ) {
            SettingsActionRow(
                icon = Icons.Rounded.Speed,
                tint = settingsIconTintMuted(),
                title = stringResource(R.string.settings_monthly_limit).lowercase(),
                subtitle = monthlyBudget?.let {
                    CurrencyUtils.formatAmount(it, currency, showSymbol = true)
                } ?: stringResource(R.string.settings_monthly_limit_not_set).lowercase(),
                onClick = onShowBudgetDialog,
            )
        }
    }
}
