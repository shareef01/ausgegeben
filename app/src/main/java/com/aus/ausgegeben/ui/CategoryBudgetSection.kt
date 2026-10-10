package com.aus.ausgegeben.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.entity.*
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.iconForCategory
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryBudgetManager(repository: AppRepository, uid: String, currency: String, globalBudget: Double?) {
    val categories by repository.allCategories.collectAsStateWithLifecycle(initialValue = emptyList())
    val snapshot by repository.categoryBudgets.collectAsStateWithLifecycle(initialValue = AppRepository.BudgetSnapshot())
    val eligible = categories.filter { it.transactionType == "expense" && it.migrationState == null }
    val eligibleIds = eligible.map { it.id }.toSet()
    val budgets = snapshot.budgets.filter { it.categoryId in eligibleIds }
    val budgetsById = budgets.associateBy { it.categoryId }
    val allocation = budgetAllocation(budgets, globalBudget)
    var selected by remember { mutableStateOf<Category?>(null) }
    var amount by remember { mutableStateOf("") }
    var threshold by remember { mutableStateOf("80") }
    var revision by remember { mutableStateOf<Long?>(null) }
    var failed by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    LaunchedEffect(eligibleIds) { if (selected?.id !in eligibleIds) selected = null }
    val scope = rememberCoroutineScope()
    fun save(remove: Boolean) {
        val cat = selected ?: return
        saving = true; failed = false
        scope.launch {
            val parsed = com.aus.ausgegeben.ui.CompositeRecordFilter(minInput = amount).bounds(currency)?.first?.div(100.0)
            val budget = if (remove) null else CategoryBudget(cat.id, parsed ?: 0.0, threshold.toIntOrNull() ?: 0)
            val result = repository.saveCategoryBudget(uid, cat.id, budget, revision)
            saving = false; failed = result.isFailure
            if (result.isSuccess) selected = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppSpacing.md, vertical = AppSpacing.xs)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
            .padding(AppSpacing.md),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = stringResource(R.string.category_budget_title),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(R.string.category_budget_repeat),
                    style = MaterialTheme.typography.bodySmall,
                    color = readableSecondaryColor()
                )
            }
        }

        // Allocation statistics box
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(AppRadius.interactive))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = stringResource(R.string.category_budget_allocated).uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = readableSecondaryColor()
                )
                Text(
                    text = CurrencyUtils.formatAmount(allocation.total, currency),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            allocation.unallocated?.let { unallocated ->
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = stringResource(R.string.category_budget_unallocated).uppercase(),
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = readableSecondaryColor()
                    )
                    Text(
                        text = CurrencyUtils.formatAmount(unallocated, currency),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = financeIncomeColor()
                    )
                }
            }
        }

        if (allocation.overAllocated > 0) {
            Text(
                text = stringResource(R.string.category_budget_above) + ": " + CurrencyUtils.formatAmount(allocation.overAllocated, currency),
                style = MaterialTheme.typography.bodySmall,
                color = financeExpenseColor()
            )
        }
        if (snapshot.incomplete || snapshot.error) {
            Text(
                text = stringResource(R.string.category_budget_incomplete),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }

        HorizontalDivider(color = appDividerColor(), thickness = 0.5.dp)

        if (budgets.isEmpty()) {
            Text(
                text = stringResource(R.string.category_budget_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = readableSecondaryColor(),
                modifier = Modifier.padding(vertical = 4.dp)
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            eligible.forEach { cat ->
                val budget = budgetsById[cat.id]
                val catColor = Color(cat.colorInt)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(AppRadius.interactive))
                        .smoothClickable {
                            selected = cat
                            amount = budget?.monthlyLimit?.toString() ?: ""
                            threshold = (budget?.warningThresholdPercent ?: 80).toString()
                            revision = budget?.updatedAt
                            failed = false
                        }
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(catColor.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = iconForCategory(cat.iconName, cat.name),
                                contentDescription = null,
                                tint = catColor,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Text(
                            text = cat.name,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (budget != null) {
                            Text(
                                text = CurrencyUtils.formatAmount(budget.monthlyLimit, currency),
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${budget.warningThresholdPercent}%",
                                style = MaterialTheme.typography.labelSmall,
                                color = readableSecondaryColor()
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.settings_monthly_limit_not_set),
                                style = MaterialTheme.typography.bodySmall,
                                color = readableSecondaryColor()
                            )
                        }
                        Icon(
                            imageVector = Icons.Rounded.ChevronRight,
                            contentDescription = null,
                            tint = navigationInactiveColor(),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }
    }

    selected?.let { cat ->
        val parsed = CompositeRecordFilter(minInput = amount).bounds(currency)?.first?.div(100.0)
        val percent = threshold.toIntOrNull()
        val valid = parsed != null && parsed > 0 && parsed < 1e9 && percent != null && percent in 1..100 && Regex("[0-9]+").matches(threshold)
        ModalBottomSheet(onDismissRequest = { if (!saving) selected = null }) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(Color(cat.colorInt).copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = iconForCategory(cat.iconName, cat.name),
                            contentDescription = null,
                            tint = Color(cat.colorInt),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Column {
                        Text(cat.name, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurface)
                        Text(stringResource(R.string.category_budget_title), style = MaterialTheme.typography.bodySmall, color = readableSecondaryColor())
                    }
                }
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text(stringResource(R.string.category_budget_limit)) },
                    isError = !valid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = threshold,
                    onValueChange = { threshold = it },
                    label = { Text(stringResource(R.string.category_budget_threshold)) },
                    isError = !valid,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                if (!valid) Text(stringResource(R.string.category_budget_invalid), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                if (failed) Text(stringResource(R.string.category_budget_conflict), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                AppButton(
                    onClick = { save(false) },
                    enabled = valid && !saving,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.action_save))
                }
                TextButton(
                    onClick = { save(true) },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.category_budget_remove), color = financeExpenseColor())
                }
            }
        }
    }
}

@Composable
fun CategoryBudgetProgressSection(
    progress: List<CategoryBudgetProgress>,
    incomplete: Boolean,
    currency: String,
    onManage: () -> Unit = {}
) {
    if (progress.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 6.dp)
                .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .appGlassCard(CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.PieChart,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Column {
                        Text(
                            text = stringResource(R.string.category_budget_title),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(R.string.category_budget_empty),
                            style = MaterialTheme.typography.bodySmall,
                            color = readableSecondaryColor()
                        )
                    }
                }
                TextButton(onClick = onManage) {
                    Text(
                        text = stringResource(R.string.category_budget_setup),
                        style = MaterialTheme.typography.labelLarge.copy(color = MaterialTheme.colorScheme.primary)
                    )
                }
            }
        }
        return
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card))
            .padding(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.category_budget_title),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(R.string.category_budget_current),
                        style = MaterialTheme.typography.labelSmall,
                        color = readableSecondaryColor()
                    )
                }
                TextButton(onClick = onManage) {
                    Text(
                        text = stringResource(R.string.action_edit),
                        style = MaterialTheme.typography.labelLarge.copy(color = MaterialTheme.colorScheme.primary)
                    )
                }
            }

            if (incomplete) {
                Text(
                    text = stringResource(R.string.category_budget_incomplete),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            progress.forEach { p ->
                val catColor = Color(p.category.colorInt)
                val statusColor = when (p.state) {
                    "over" -> financeExpenseColor()
                    "warning", "reached" -> Color(0xFFF59E0B)
                    else -> financeIncomeColor()
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(AppRadius.interactive))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(catColor.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = iconForCategory(p.category.iconName, p.category.name),
                                    contentDescription = null,
                                    tint = catColor,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Text(
                                text = p.category.name,
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        Text(
                            text = CurrencyUtils.formatAmount(p.spent, currency) + " / " + CurrencyUtils.formatAmount(p.budget.monthlyLimit, currency),
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    LinearProgressIndicator(
                        progress = { (p.percent / 100).toFloat().coerceIn(0f, 1f) },
                        color = statusColor,
                        trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape)
                            .semantics { contentDescription = p.category.name }
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = stringResource(
                                when (p.state) {
                                    "over" -> R.string.category_budget_over
                                    "reached" -> R.string.category_budget_reached
                                    "warning" -> R.string.category_budget_warning
                                    else -> R.string.category_budget_normal
                                }
                            ) + " · ${kotlin.math.round(p.percent).toInt()}%",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                            color = statusColor
                        )

                        Text(
                            text = stringResource(if (p.overspent > 0) R.string.category_budget_overspent else R.string.category_budget_remaining) + ": " + CurrencyUtils.formatAmount(if (p.overspent > 0) p.overspent else p.remaining, currency),
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = if (p.overspent > 0) financeExpenseColor() else readableSecondaryColor()
                        )
                    }
                }
            }
        }
    }
}
