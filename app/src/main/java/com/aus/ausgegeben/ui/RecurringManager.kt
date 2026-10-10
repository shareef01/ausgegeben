package com.aus.ausgegeben.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Recurrence
import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.iconForCategory
import java.time.ZoneId
import java.util.UUID

@Composable
fun RecurringManager(
    vm: RecurringViewModel,
    categories: List<Category>,
    owner: String?,
    canWrite: Boolean
) {
    var open by remember(owner) { mutableStateOf(false) }
    RecurringManagerSheet(
        isOpen = open,
        onDismissRequest = { open = false },
        vm = vm,
        categories = categories,
        owner = owner,
        canWrite = canWrite,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecurringManagerSheet(
    isOpen: Boolean,
    onDismissRequest: () -> Unit,
    vm: RecurringViewModel,
    categories: List<Category>,
    owner: String?,
    canWrite: Boolean,
) {
    var draft by remember(owner) { mutableStateOf<RecurringTemplate?>(null) }
    var expected by remember(owner) { mutableStateOf<Long?>(null) }
    var removing by remember(owner) { mutableStateOf<RecurringTemplate?>(null) }
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var localError by remember { mutableStateOf(false) }
    val rows = if (snapshot.owner == owner) snapshot.rows else emptyList()

    if (isOpen && owner != null) {
        ModalBottomSheet(
            onDismissRequest = { if (!busy) onDismissRequest() },
            containerColor = MaterialTheme.colorScheme.surface,
            dragHandle = { BottomSheetDefaults.DragHandle() },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.recurring_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface,
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (canWrite) {
                            AppIconButton(
                                onClick = vm::synchronize,
                                icon = Icons.Rounded.Sync,
                                contentDescription = stringResource(R.string.recurring_refresh),
                                enabled = !busy,
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                        IconButton(onClick = onDismissRequest) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = stringResource(R.string.action_cancel),
                                tint = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }

                Text(
                    text = stringResource(R.string.recurring_contract),
                    style = MaterialTheme.typography.bodySmall,
                    color = readableSecondaryColor(),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (canWrite) {
                    AppButton(
                        onClick = {
                            val now = System.currentTimeMillis()
                            val zone = ZoneId.systemDefault().id
                            val start = Recurrence.localDate(now, zone)
                            expected = null
                            draft = RecurringTemplate(
                                id = UUID.randomUUID().toString(),
                                amount = 1.0,
                                categoryId = categories.firstOrNull { it.transactionType == "expense" }?.id ?: "",
                                note = "",
                                transactionType = "expense",
                                frequency = "monthly",
                                interval = 1,
                                startDate = start,
                                endDate = null,
                                timeZone = zone,
                                enabled = true,
                                nextIndex = 0,
                                nextDate = start,
                                createdAt = now,
                                updatedAt = now,
                            )
                        },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
                    ) {
                        Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.recurring_new))
                    }
                }

                if (snapshot.incomplete) {
                    Text(
                        text = stringResource(R.string.recurring_offline),
                        style = MaterialTheme.typography.bodySmall,
                        color = settingsDestructiveColor(),
                    )
                }

                if (error || localError) {
                    Text(
                        text = stringResource(R.string.recurring_error),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                // Recurring Items List
                if (rows.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        EmptyStateMessage(
                            icon = Icons.Rounded.Repeat,
                            title = stringResource(R.string.recurring_empty),
                            subtitle = if (canWrite) "" else stringResource(R.string.recurring_offline),
                        )
                    }
                } else {
                    rows.forEach { row ->
                        val cat = categories.firstOrNull { it.id == row.categoryId }
                        val catName = cat?.name ?: stringResource(R.string.recurring_title)
                        val frequencyRes = when (row.frequency) {
                            "daily" -> R.string.recurring_daily
                            "weekly" -> R.string.recurring_weekly
                            "monthly" -> R.string.recurring_monthly
                            else -> R.string.recurring_yearly
                        }
                        val frequencyText = "${stringResource(R.string.recurring_every)} ${row.interval} ${stringResource(frequencyRes)}"
                        val statusText = when {
                            !row.enabled -> stringResource(R.string.recurring_paused)
                            row.nextDate == null -> stringResource(R.string.recurring_ended)
                            else -> stringResource(R.string.recurring_active)
                        }
                        val statusColor = if (row.enabled && row.nextDate != null) financeIncomeColor() else readableSecondaryColor()

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .appGlassCard(RoundedCornerShape(AppRadius.card))
                                .padding(16.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .appGlassCard(CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = iconForCategory(cat?.iconName ?: "", catName),
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = row.note.ifBlank { catName },
                                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                        )
                                        Text(
                                            text = "$catName · $frequencyText",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = readableSecondaryColor(),
                                        )
                                    }

                                    Text(
                                        text = "${row.amount}",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                        color = if (row.transactionType == "income") financeIncomeColor() else financeExpenseColor(),
                                    )
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(AppRadius.pill))
                                                .background(statusColor.copy(alpha = 0.15f))
                                                .padding(horizontal = 8.dp, vertical = 4.dp),
                                        ) {
                                            Text(
                                                text = statusText,
                                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                                color = statusColor,
                                            )
                                        }

                                        Text(
                                            text = "${stringResource(R.string.recurring_next)}: ${row.nextDate ?: "—"}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = readableSecondaryColor(),
                                        )
                                    }

                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        AppIconButton(
                                            onClick = {
                                                expected = row.updatedAt
                                                draft = row
                                            },
                                            icon = Icons.Rounded.Edit,
                                            contentDescription = stringResource(R.string.recurring_edit),
                                            enabled = canWrite && !busy,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(36.dp),
                                        )
                                        AppIconButton(
                                            onClick = { vm.save(row.copy(enabled = !row.enabled), row.updatedAt) },
                                            icon = if (row.enabled) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                            contentDescription = stringResource(if (row.enabled) R.string.recurring_pause else R.string.recurring_resume),
                                            enabled = canWrite && !busy,
                                            tint = statusColor,
                                            modifier = Modifier.size(36.dp),
                                        )
                                        AppIconButton(
                                            onClick = { removing = row },
                                            icon = Icons.Rounded.DeleteOutline,
                                            contentDescription = stringResource(R.string.action_delete),
                                            enabled = canWrite && !busy,
                                            tint = settingsDestructiveColor(),
                                            modifier = Modifier.size(36.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(48.dp).navigationBarsPadding())
            }
        }
    }

    // Editor Dialog
    draft?.let { d ->
        var amount by remember(d.id) { mutableStateOf(d.amount.toString()) }
        var interval by remember(d.id) { mutableStateOf(d.interval.toString()) }
        var note by remember(d.id) { mutableStateOf(d.note) }
        var startDate by remember(d.id) { mutableStateOf(d.startDate) }
        var endDate by remember(d.id) { mutableStateOf(d.endDate ?: "") }

        AlertDialog(
            onDismissRequest = { if (!busy) draft = null },
            title = {
                Text(
                    text = if (expected != null) stringResource(R.string.recurring_edit) else stringResource(R.string.recurring_new),
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it },
                        label = { Text(stringResource(R.string.recurring_amount)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Choice(
                        label = stringResource(R.string.recurring_type),
                        values = listOf("expense", "income", "transfer"),
                        labels = listOf(stringResource(R.string.add_type_expense), stringResource(R.string.add_type_income), stringResource(R.string.add_type_transfer)),
                        selected = d.transactionType,
                    ) { draft = d.copy(transactionType = it, categoryId = "") }

                    val eligible = categories.filter { it.transactionType == d.transactionType && it.migrationState == null }
                    Choice(
                        label = stringResource(R.string.recurring_category),
                        values = eligible.map { it.id },
                        labels = eligible.map { it.name },
                        selected = d.categoryId,
                    ) { draft = d.copy(categoryId = it) }

                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it.take(2000); draft = d.copy(note = it.take(2000)) },
                        label = { Text(stringResource(R.string.recurring_note)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = interval,
                        onValueChange = { interval = it },
                        label = { Text(stringResource(R.string.recurring_every)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Choice(
                        label = stringResource(R.string.recurring_frequency),
                        values = listOf("daily", "weekly", "monthly", "yearly"),
                        labels = listOf(stringResource(R.string.recurring_daily), stringResource(R.string.recurring_weekly), stringResource(R.string.recurring_monthly), stringResource(R.string.recurring_yearly)),
                        selected = d.frequency,
                    ) { draft = d.copy(frequency = it) }

                    OutlinedTextField(
                        value = startDate,
                        onValueChange = { startDate = it; draft = d.copy(startDate = it) },
                        label = { Text(stringResource(R.string.recurring_starts)) },
                        placeholder = { Text("YYYY-MM-DD") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = endDate,
                        onValueChange = { endDate = it; draft = d.copy(endDate = it.ifBlank { null }) },
                        label = { Text(stringResource(R.string.recurring_ends)) },
                        placeholder = { Text("YYYY-MM-DD") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                AppButton(
                    onClick = {
                        val parsed = d.copy(
                            amount = amount.replace(',', '.').toDoubleOrNull() ?: Double.NaN,
                            interval = interval.toIntOrNull() ?: 0,
                        )
                        val next = runCatching { parsed.copy(nextDate = Recurrence.date(parsed, parsed.nextIndex)) }.getOrNull()
                        if (next == null || !next.valid()) {
                            localError = true
                        } else {
                            localError = false
                            vm.save(next, expected) { draft = null }
                        }
                    },
                    enabled = canWrite && !busy,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            },
            dismissButton = {
                TextButton(onClick = { draft = null }, enabled = !busy) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    removing?.let { row ->
        AppDestructiveConfirmDialog(
            onDismissRequest = { if (!busy) removing = null },
            title = { Text(stringResource(R.string.recurring_delete)) },
            text = { AppDialogBodyText(stringResource(R.string.recurring_delete_message)) },
            confirmLabel = stringResource(R.string.action_delete),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = {
                vm.remove(row)
                removing = null
            },
        )
    }
}

@Composable
private fun Choice(
    label: String,
    values: List<String>,
    labels: List<String>,
    selected: String,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = readableSecondaryColor())
        Box {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .semantics {
                        contentDescription = "$label: ${labels.getOrNull(values.indexOf(selected)) ?: "—"}"
                    },
            ) {
                Text(labels.getOrNull(values.indexOf(selected)) ?: "—")
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                values.forEachIndexed { i, value ->
                    DropdownMenuItem(
                        text = { Text(labels[i]) },
                        onClick = {
                            onSelect(value)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}
