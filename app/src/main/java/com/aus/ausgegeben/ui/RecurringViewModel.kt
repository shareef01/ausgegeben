package com.aus.ausgegeben.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aus.ausgegeben.data.RecurringRepository
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.entity.RecurringTemplate
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class RecurringViewModel @Inject constructor(private val repository: RecurringRepository, private val auth: AuthRepository): ViewModel() {
    val snapshot=auth.authState.flatMapLatest { user -> if(user == null) flowOf(RecurringRepository.Snapshot(null)) else repository.observe(user.uid) }
        .stateIn(viewModelScope,SharingStarted.WhileSubscribed(0),RecurringRepository.Snapshot(null))
    private val _error=MutableStateFlow(false); val error=_error.asStateFlow()
    private val _issues=MutableStateFlow<List<com.aus.ausgegeben.data.RecurringIssue>>(emptyList())
    /** The quarantined occurrences themselves, so the sheet can name each affected item. */
    val issues=_issues.asStateFlow()
    /**
     * Quarantine warning state. Issues survive a failed pass (a network or auth failure says
     * nothing about data integrity) and are cleared only by a verified healthy pass. Account
     * isolation comes from MainActivity keying this ViewModel on the signed-in uid, plus the
     * `repository.uid == owner` guard that drops results finishing after an account switch.
     */
    val issueState: StateFlow<RecurringIssueState> = combine(_issues, _error) { issues, error ->
        recurringIssueState(issues, error, false)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), recurringIssueState(emptyList(), false, false))
    private val _busy=MutableStateFlow(false); val busy=_busy.asStateFlow()
    private var syncJob: Job?=null
    fun synchronize() {
        val owner=repository.uid ?: return
        if(auth.currentUser?.isEmailVerified != true || syncJob?.isActive == true) return
        syncJob=viewModelScope.launch {
            try {
                repository.reconcile(owner)
                if(repository.uid==owner) {
                    _error.value=false
                    _issues.value=repository.getRecurringIssues(owner)
                }
            } catch(e:CancellationException){throw e}
            catch(_:Exception){ if(repository.uid==owner) _error.value=true }
        }
    }
    private fun mutate(action:suspend (String)->Unit) {
        val owner=repository.uid ?: return
        if(_busy.value) return
        _busy.value=true; _error.value=false
        viewModelScope.launch { try{action(owner)}catch(e:CancellationException){throw e}catch(_:Exception){if(repository.uid==owner)_error.value=true}finally{_busy.value=false} }
    }
    fun save(template:RecurringTemplate,expected:Long?,onSuccess:()->Unit = {})=mutate { owner -> repository.save(owner,template,expected); if(repository.uid==owner)onSuccess() }
    fun remove(template:RecurringTemplate)=mutate { repository.remove(it,template.id,template.updatedAt) }
    /** Skip [date] for a template stuck on it, then re-run catch-up for the dates after it. */
    fun skip(template:RecurringTemplate,date:String)=mutate { owner ->
        repository.skipOccurrence(owner,template.id,date,template.updatedAt)
        if(repository.uid==owner) { _issues.value=repository.getRecurringIssues(owner); synchronizeAfterMutation() }
    }
    // mutate() holds `busy` until its block returns; the catch-up pass runs on its own job.
    private fun synchronizeAfterMutation() { viewModelScope.launch { synchronize() } }
}
