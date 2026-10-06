package com.aus.ausgegeben.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.data.entity.Recurrence
import java.time.ZoneId
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecurringManager(vm:RecurringViewModel, categories:List<Category>, owner:String?, canWrite:Boolean) {
    var open by remember(owner) { mutableStateOf(false) }
    var draft by remember(owner) { mutableStateOf<RecurringTemplate?>(null) }
    var expected by remember(owner) { mutableStateOf<Long?>(null) }
    var removing by remember(owner) { mutableStateOf<RecurringTemplate?>(null) }
    val snapshot by vm.snapshot.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var localError by remember { mutableStateOf(false) }
    val rows=if(snapshot.owner==owner) snapshot.rows else emptyList()
    OutlinedButton(onClick={open=true},enabled=owner!=null,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) { Text(stringResource(R.string.recurring_title)) }
    if(open && owner!=null) ModalBottomSheet(onDismissRequest={if(!busy)open=false}) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.recurring_title),style=MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick={open=false},enabled=!busy,modifier=Modifier.heightIn(min=48.dp)) {Text(stringResource(R.string.recurring_close))}
            Text(stringResource(R.string.recurring_contract))
            if(snapshot.incomplete) Text(stringResource(R.string.recurring_offline))
            if(error||localError) Text(stringResource(R.string.recurring_error),color=MaterialTheme.colorScheme.error)
            OutlinedButton(onClick=vm::synchronize,enabled=canWrite&&!busy) { Text(stringResource(R.string.recurring_refresh)) }
            if(draft==null) Button(onClick={
                val now=System.currentTimeMillis();val zone=ZoneId.systemDefault().id;val start=Recurrence.localDate(now,zone)
                expected=null;draft=RecurringTemplate(UUID.randomUUID().toString(),1.0,categories.firstOrNull {it.transactionType=="expense"}?.id ?: "","","expense","monthly",1,start,null,zone,true,0,start,now,now)
            },enabled=canWrite&&!busy) { Text(stringResource(R.string.recurring_new)) }
            draft?.let { d ->
                var amount by remember(d.id) { mutableStateOf(d.amount.toString()) }
                var interval by remember(d.id) { mutableStateOf(d.interval.toString()) }
                OutlinedTextField(amount,{amount=it},label={Text(stringResource(R.string.recurring_amount))},modifier=Modifier.fillMaxWidth(),singleLine=true)
                Choice(stringResource(R.string.recurring_type),listOf("expense","income","transfer"),listOf(stringResource(R.string.add_type_expense),stringResource(R.string.add_type_income),stringResource(R.string.add_type_transfer)),d.transactionType) { draft=d.copy(transactionType=it,categoryId="") }
                val eligible=categories.filter {it.transactionType==d.transactionType&&it.migrationState==null}
                Choice(stringResource(R.string.recurring_category),eligible.map{it.id},eligible.map{it.name},d.categoryId) {draft=d.copy(categoryId=it)}
                OutlinedTextField(d.note,{draft=d.copy(note=it.take(2000))},label={Text(stringResource(R.string.recurring_note))},modifier=Modifier.fillMaxWidth())
                OutlinedTextField(interval,{interval=it},label={Text(stringResource(R.string.recurring_every))},singleLine=true,modifier=Modifier.fillMaxWidth())
                Choice(stringResource(R.string.recurring_frequency),listOf("daily","weekly","monthly","yearly"),listOf(stringResource(R.string.recurring_daily),stringResource(R.string.recurring_weekly),stringResource(R.string.recurring_monthly),stringResource(R.string.recurring_yearly)),d.frequency) {draft=d.copy(frequency=it)}
                OutlinedTextField(d.startDate,{draft=d.copy(startDate=it)},label={Text(stringResource(R.string.recurring_starts))},placeholder={Text("YYYY-MM-DD")},singleLine=true,modifier=Modifier.fillMaxWidth())
                OutlinedTextField(d.endDate ?: "",{draft=d.copy(endDate=it.ifBlank {null})},label={Text(stringResource(R.string.recurring_ends))},placeholder={Text("YYYY-MM-DD")},singleLine=true,modifier=Modifier.fillMaxWidth())
                Text(stringResource(R.string.recurring_zone)+": "+d.timeZone)
                Button(onClick={
                    val parsed=d.copy(amount=amount.replace(',','.').toDoubleOrNull()?:Double.NaN,interval=interval.toIntOrNull()?:0)
                    val next=runCatching {parsed.copy(nextDate=Recurrence.date(parsed,parsed.nextIndex))}.getOrNull()
                    if(next==null||!next.valid())localError=true else {localError=false;vm.save(next,expected){draft=null}}
                },enabled=canWrite&&!busy) {Text(stringResource(R.string.action_save))}
                OutlinedButton(onClick={draft=null},enabled=!busy){Text(stringResource(R.string.action_cancel))}
            }
            if(rows.isEmpty())Text(stringResource(R.string.recurring_empty))
            rows.forEach { row ->
                HorizontalDivider()
                Text(row.note.ifBlank {categories.firstOrNull {it.id==row.categoryId}?.name ?: stringResource(R.string.recurring_title)},style=MaterialTheme.typography.titleMedium)
                Text("${row.amount} · ${categories.firstOrNull {it.id==row.categoryId}?.name ?: ""}")
                val frequency=when(row.frequency){"daily"->R.string.recurring_daily;"weekly"->R.string.recurring_weekly;"monthly"->R.string.recurring_monthly;else->R.string.recurring_yearly}
                Text(stringResource(R.string.recurring_every)+" ${row.interval} "+stringResource(frequency))
                Text(stringResource(if(!row.enabled)R.string.recurring_paused else if(row.nextDate==null)R.string.recurring_ended else R.string.recurring_active),modifier=Modifier.semantics {liveRegion=LiveRegionMode.Polite})
                Text(stringResource(R.string.recurring_next)+": "+(row.nextDate ?: "—"))
                OutlinedButton(onClick={expected=row.updatedAt;draft=row},enabled=canWrite&&!busy){Text(stringResource(R.string.recurring_edit))}
                OutlinedButton(onClick={vm.save(row.copy(enabled=!row.enabled),row.updatedAt)},enabled=canWrite&&!busy){Text(stringResource(if(row.enabled)R.string.recurring_pause else R.string.recurring_resume))}
                OutlinedButton(onClick={removing=row},enabled=canWrite&&!busy){Text(stringResource(R.string.action_delete))}
            }
            Spacer(Modifier.height(24.dp))
        }
    }
    removing?.let { row -> AlertDialog(onDismissRequest={if(!busy)removing=null},title={Text(stringResource(R.string.recurring_delete))},text={Text(stringResource(R.string.recurring_delete_message))},confirmButton={TextButton(onClick={vm.remove(row);removing=null},enabled=!busy){Text(stringResource(R.string.action_delete))}},dismissButton={TextButton(onClick={removing=null},enabled=!busy){Text(stringResource(R.string.action_cancel))}}) }
}
@Composable
private fun Choice(label:String,values:List<String>,labels:List<String>,selected:String,onSelect:(String)->Unit) {
    var expanded by remember {mutableStateOf(false)}
    Column {
        Text(label)
        Box { OutlinedButton(onClick={expanded=true},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp).semantics {contentDescription=label+": "+(labels.getOrNull(values.indexOf(selected)) ?: "—")}) {Text(labels.getOrNull(values.indexOf(selected)) ?: "—")}
            DropdownMenu(expanded,onDismissRequest={expanded=false}) { values.forEachIndexed {i,value-> DropdownMenuItem(text={Text(labels[i])},onClick={onSelect(value);expanded=false}) } }
        }
    }
}
