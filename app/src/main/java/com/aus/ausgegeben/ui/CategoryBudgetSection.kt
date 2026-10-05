package com.aus.ausgegeben.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.entity.*
import com.aus.ausgegeben.util.CurrencyUtils
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
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.category_budget_title), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.category_budget_repeat))
        Text(stringResource(R.string.category_budget_allocated) + ": " + CurrencyUtils.formatAmount(allocation.total, currency))
        allocation.unallocated?.let { Text(stringResource(R.string.category_budget_unallocated) + ": " + CurrencyUtils.formatAmount(it, currency)) }
        if (allocation.overAllocated > 0) Text(stringResource(R.string.category_budget_above) + ": " + CurrencyUtils.formatAmount(allocation.overAllocated, currency))
        if (snapshot.incomplete || snapshot.error) Text(stringResource(R.string.category_budget_incomplete))
        if (budgets.isEmpty()) Text(stringResource(R.string.category_budget_empty))
        eligible.forEach { cat ->
            val budget = budgetsById[cat.id]
            TextButton(onClick = { selected = cat; amount = budget?.monthlyLimit?.toString() ?: ""; threshold = (budget?.warningThresholdPercent ?: 80).toString(); revision = budget?.updatedAt; failed = false }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(cat.name + (budget?.let { " · " + CurrencyUtils.formatAmount(it.monthlyLimit, currency) + " · ${it.warningThresholdPercent}%" } ?: ""))
            }
        }
    }
    selected?.let { cat ->
        val parsed = CompositeRecordFilter(minInput = amount).bounds(currency)?.first?.div(100.0)
        val percent = threshold.toIntOrNull()
        val valid = parsed != null && parsed > 0 && parsed < 1e9 && percent != null && percent in 1..100 && Regex("[0-9]+").matches(threshold)
        ModalBottomSheet(onDismissRequest = { if (!saving) selected = null }) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(cat.name, style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(value = amount, onValueChange = { amount = it }, label = { Text(stringResource(R.string.category_budget_limit)) }, isError = !valid, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = threshold, onValueChange = { threshold = it }, label = { Text(stringResource(R.string.category_budget_threshold)) }, isError = !valid, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                if (!valid) Text(stringResource(R.string.category_budget_invalid))
                if (failed) Text(stringResource(R.string.category_budget_conflict))
                Button(onClick = { save(false) }, enabled = valid && !saving, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.action_save)) }
                TextButton(onClick = { save(true) }, enabled = !saving, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.category_budget_remove)) }
            }
        }
    }
}

@Composable
fun CategoryBudgetProgressSection(progress: List<CategoryBudgetProgress>, incomplete: Boolean, currency: String, onManage: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.category_budget_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.category_budget_current))
        if (incomplete) Text(stringResource(R.string.category_budget_incomplete))
        if (progress.isEmpty()) {
            Text(stringResource(R.string.category_budget_empty))
            TextButton(onClick = onManage, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.category_budget_title)) }
        }
        progress.forEach { p ->
            Icon(com.aus.ausgegeben.util.iconForCategory(p.category), contentDescription = null, tint = androidx.compose.ui.graphics.Color(p.category.colorInt))
            Text(p.category.name, style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.category_budget_spent) + ": " + CurrencyUtils.formatAmount(p.spent, currency) + " / " + CurrencyUtils.formatAmount(p.budget.monthlyLimit, currency) + " · ${kotlin.math.round(p.percent).toInt()}%")
            LinearProgressIndicator(progress = { (p.percent / 100).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().semantics { contentDescription = p.category.name })
            if (!incomplete || p.state != "normal") Text(stringResource(when(p.state) { "over" -> R.string.category_budget_over; "reached" -> R.string.category_budget_reached; "warning" -> R.string.category_budget_warning; else -> R.string.category_budget_normal }))
            Text(stringResource(if (p.overspent > 0) R.string.category_budget_overspent else R.string.category_budget_remaining) + ": " + CurrencyUtils.formatAmount(if (p.overspent > 0) p.overspent else p.remaining, currency))
        }
    }
}
