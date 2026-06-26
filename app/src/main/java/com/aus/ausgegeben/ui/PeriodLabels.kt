package com.aus.ausgegeben.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.RecordListPeriod

@Composable
fun RecordListPeriod.label(): String = when (this) {
    RecordListPeriod.THIS_MONTH -> stringResource(R.string.record_period_this_month)
    RecordListPeriod.ALL_TIME -> stringResource(R.string.record_period_all_time)
}

@Composable
fun AnalyticsPeriod.label(): String = when (this) {
    AnalyticsPeriod.THIS_MONTH -> stringResource(R.string.period_this_month)
    AnalyticsPeriod.LAST_MONTH -> stringResource(R.string.period_last_month)
    AnalyticsPeriod.ALL_TIME -> stringResource(R.string.period_all_time)
}

@Composable
fun ThemeMode.label(): String = when (this) {
    ThemeMode.SYSTEM -> stringResource(R.string.theme_system)
    ThemeMode.LIGHT -> stringResource(R.string.theme_light)
    ThemeMode.DARK -> stringResource(R.string.theme_dark)
    ThemeMode.AMOLED -> stringResource(R.string.theme_amoled)
    ThemeMode.MIDNIGHT -> stringResource(R.string.theme_midnight)
    ThemeMode.OCEAN -> stringResource(R.string.theme_ocean)
    ThemeMode.FOREST -> stringResource(R.string.theme_forest)
    ThemeMode.SUNSET -> stringResource(R.string.theme_sunset)
    ThemeMode.LAVENDER -> stringResource(R.string.theme_lavender)
    ThemeMode.SOFT_LIGHT -> stringResource(R.string.theme_soft_light)
}

@Composable
fun TransactionType.label(): String = when (this) {
    TransactionType.EXPENSE -> stringResource(R.string.add_type_expense)
    TransactionType.INCOME -> stringResource(R.string.add_type_income)
    TransactionType.TRANSFER -> stringResource(R.string.add_type_transfer)
}

@Composable
fun TransactionTypeFilter.label(): String = when (this) {
    TransactionTypeFilter.ALL -> stringResource(R.string.filter_all)
    TransactionTypeFilter.EXPENSE -> stringResource(R.string.filter_expense)
    TransactionTypeFilter.INCOME -> stringResource(R.string.filter_income)
    TransactionTypeFilter.TRANSFER -> stringResource(R.string.filter_transfer)
}
