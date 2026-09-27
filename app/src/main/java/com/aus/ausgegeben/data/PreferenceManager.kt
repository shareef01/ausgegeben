package com.aus.ausgegeben.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.io.IOException
import com.aus.ausgegeben.ui.theme.ThemeMode
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.ExportUtils
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import java.util.UUID

// internal for tests (seeding pre-migration legacy state); production code must go
// through PreferenceManager, never this store directly.
internal val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

@Singleton
class PreferenceManager @Inject constructor(
    @ApplicationContext context: Context,
) : TransactionPreferences {
    // Always pin DataStore to the application context — callers often pass an Activity.
    private val context = context.applicationContext
    private val crypto = PrefsCrypto()

    private object PreferencesKeys {
        val CURRENCY = stringPreferencesKey("currency")
        val DARK_MODE = booleanPreferencesKey("dark_mode")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val ONBOARDING_COMPLETE = stringPreferencesKey("onboarding_complete_enc")
        val DAILY_REMINDER = stringPreferencesKey("daily_reminder_enc")
        val REMINDER_HOUR = stringPreferencesKey("reminder_hour_enc")
        val REMINDER_MINUTE = stringPreferencesKey("reminder_minute_enc")
        val ANALYTICS_PERIOD = stringPreferencesKey("analytics_period")
        val MONTHLY_BUDGET = stringPreferencesKey("monthly_budget")
        val LAST_CLOUD_SYNC_AT = stringPreferencesKey("last_cloud_sync_at")
        val LANGUAGE = stringPreferencesKey("language")
        /** LWW clock shared with web (`users/{uid}/settings/preferences.updatedAt`). */
        val PREFERENCES_UPDATED_AT = stringPreferencesKey("preferences_updated_at")
        /**
         * Durable journal of EVERY unresolved submission attempt (DATA-2). Members are
         * sealed `operationId|createdAt` blobs — the set key itself carries no user
         * data, only opaque ciphertexts.
         */
        val PENDING_EXPENSE_OPERATIONS = stringSetPreferencesKey("pending_expense_operations_enc")
        // Legacy single-slot journal keys (pre-DATA-2); migrated into the set above on
        // the first journal access so an upgraded install keeps its pending state.
        val PENDING_EXPENSE_OPERATION_ID = stringPreferencesKey("pending_expense_operation_id_enc")
        val PENDING_EXPENSE_CREATED_AT = stringPreferencesKey("pending_expense_created_at_enc")
        // Legacy plaintext keys (migrated into sealed blobs on first read/write).
        val LEGACY_ONBOARDING = booleanPreferencesKey("onboarding_complete")
        val LEGACY_DAILY_REMINDER = booleanPreferencesKey("daily_reminder")
        val LEGACY_REMINDER_HOUR = intPreferencesKey("reminder_hour")
        val LEGACY_REMINDER_MINUTE = intPreferencesKey("reminder_minute")
    }

    private fun Preferences.sealedString(key: Preferences.Key<String>, default: String): String =
        crypto.open(this[key]) ?: default

    private fun Preferences.sealedBoolean(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Boolean>,
        default: Boolean,
    ): Boolean {
        this[key]?.let { return crypto.openBoolean(it, default) }
        return this[legacy] ?: default
    }

    private fun Preferences.sealedInt(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Int>,
        default: Int,
    ): Int {
        this[key]?.let { return crypto.openInt(it, default) }
        return this[legacy] ?: default
    }

    // Strict variants for [snapshotSyncedPreferences]: a present-but-unreadable sealed
    // value must THROW, not silently become its default — the snapshot is pushed to the
    // cloud, where a defaulted value would overwrite the user's real synced data
    // (STOR-2). Display-facing flows keep using the lenient variants above.

    private fun Preferences.strictSealedString(key: Preferences.Key<String>, default: String): String {
        val stored = this[key] ?: return default
        return crypto.openStrict(stored) ?: default
    }

    private fun Preferences.strictSealedBoolean(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Boolean>,
        default: Boolean,
    ): Boolean {
        this[key]?.let { return crypto.openBooleanStrict(it, default) }
        return this[legacy] ?: default
    }

    private fun Preferences.strictSealedInt(
        key: Preferences.Key<String>,
        legacy: Preferences.Key<Int>,
        default: Int,
    ): Int {
        this[key]?.let { return crypto.openIntStrict(it, default) }
        return this[legacy] ?: default
    }

    private fun dataFlow(): Flow<Preferences> = context.dataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }

    val languageFlow: Flow<String> = dataFlow().map { it[PreferencesKeys.LANGUAGE] ?: "en" }

    override val currencyFlow: Flow<String> = dataFlow().map { prefs ->
        prefs.sealedString(PreferencesKeys.CURRENCY, "EUR")
    }

    val themeModeFlow: Flow<ThemeMode> = dataFlow().map { preferences ->
        preferences[PreferencesKeys.THEME_MODE]?.let { ThemeMode.fromStorageKey(it) }
            ?: when (preferences[PreferencesKeys.DARK_MODE]) {
                false -> ThemeMode.LIGHT
                true -> ThemeMode.DARK
                null -> ThemeMode.SYSTEM
            }
    }

    val onboardingCompleteFlow: Flow<Boolean> = dataFlow().map { preferences ->
        preferences.sealedBoolean(
            PreferencesKeys.ONBOARDING_COMPLETE,
            PreferencesKeys.LEGACY_ONBOARDING,
            false,
        )
    }

    val dailyReminderFlow: Flow<Boolean> = dataFlow().map { preferences ->
        preferences.sealedBoolean(
            PreferencesKeys.DAILY_REMINDER,
            PreferencesKeys.LEGACY_DAILY_REMINDER,
            true,
        )
    }

    suspend fun isDailyReminderEnabled(): Boolean = dailyReminderFlow.first()

    val reminderHourFlow: Flow<Int> = dataFlow().map { preferences ->
        preferences.sealedInt(
            PreferencesKeys.REMINDER_HOUR,
            PreferencesKeys.LEGACY_REMINDER_HOUR,
            19,
        )
    }

    val reminderMinuteFlow: Flow<Int> = dataFlow().map { preferences ->
        preferences.sealedInt(
            PreferencesKeys.REMINDER_MINUTE,
            PreferencesKeys.LEGACY_REMINDER_MINUTE,
            0,
        )
    }

    override val analyticsPeriodFlow: Flow<String> = dataFlow().map { prefs ->
        prefs.sealedString(
            PreferencesKeys.ANALYTICS_PERIOD,
            AnalyticsPeriod.THIS_MONTH.storageKey,
        )
    }

    override val monthlyBudgetFlow: Flow<Double?> = dataFlow().map { prefs ->
        crypto.open(prefs[PreferencesKeys.MONTHLY_BUDGET])
            ?.toDoubleOrNull()
            ?.takeIf { it > 0 }
    }

    val lastCloudSyncAtFlow: Flow<Long?> = dataFlow().map { preferences ->
        crypto.open(preferences[PreferencesKeys.LAST_CLOUD_SYNC_AT])?.toLongOrNull()
    }

    val preferencesUpdatedAtFlow: Flow<Long> = dataFlow()
        .map { preferences ->
            crypto.open(preferences[PreferencesKeys.PREFERENCES_UPDATED_AT])?.toLongOrNull() ?: 0L
        }
        .distinctUntilChanged()

    suspend fun preferencesUpdatedAt(): Long = preferencesUpdatedAtFlow.first()

    suspend fun reminderTime(): Pair<Int, Int> {
        val prefs = context.dataStore.data.first()
        val hour = prefs.sealedInt(
            PreferencesKeys.REMINDER_HOUR,
            PreferencesKeys.LEGACY_REMINDER_HOUR,
            19,
        )
        val minute = prefs.sealedInt(
            PreferencesKeys.REMINDER_MINUTE,
            PreferencesKeys.LEGACY_REMINDER_MINUTE,
            0,
        )
        return hour to minute
    }

    /**
     * Build the local preference snapshot for cloud sync.
     *
     * STOR-2: this snapshot is PUSHED to the cloud, so a present-but-unreadable sealed
     * value throws [PrefsCrypto.SealedValueUnreadableException] instead of silently
     * becoming its default — pushing defaults would overwrite the user's real synced
     * data. Callers must refuse the push on that exception and surface a sync error.
     * Display-facing flows intentionally keep using the lenient variants.
     */
    suspend fun snapshotSyncedPreferences(): SyncedPreferences {
        val prefs = context.dataStore.data.first()
        val theme = prefs[PreferencesKeys.THEME_MODE]?.let { ThemeMode.fromStorageKey(it) }
            ?: when (prefs[PreferencesKeys.DARK_MODE]) {
                false -> ThemeMode.LIGHT
                true -> ThemeMode.DARK
                null -> ThemeMode.SYSTEM
            }
        return SyncedPreferences(
            currency = prefs.strictSealedString(PreferencesKeys.CURRENCY, "EUR"),
            locale = prefs[PreferencesKeys.LANGUAGE] ?: "en",
            themeMode = theme.storageKey,
            onboardingComplete = prefs.strictSealedBoolean(
                PreferencesKeys.ONBOARDING_COMPLETE,
                PreferencesKeys.LEGACY_ONBOARDING,
                false,
            ),
            dailyReminder = prefs.strictSealedBoolean(
                PreferencesKeys.DAILY_REMINDER,
                PreferencesKeys.LEGACY_DAILY_REMINDER,
                true,
            ),
            reminderHour = prefs.strictSealedInt(
                PreferencesKeys.REMINDER_HOUR,
                PreferencesKeys.LEGACY_REMINDER_HOUR,
                19,
            ),
            reminderMinute = prefs.strictSealedInt(
                PreferencesKeys.REMINDER_MINUTE,
                PreferencesKeys.LEGACY_REMINDER_MINUTE,
                0,
            ),
            analyticsPeriod = prefs.strictSealedString(
                PreferencesKeys.ANALYTICS_PERIOD,
                AnalyticsPeriod.THIS_MONTH.storageKey,
            ),
            monthlyBudget = prefs[PreferencesKeys.MONTHLY_BUDGET]?.let { stored ->
                crypto.openStrict(stored)
                    ?.toDoubleOrNull()
                    ?.takeIf { it > 0 }
            },
            updatedAt = prefs[PreferencesKeys.PREFERENCES_UPDATED_AT]?.let { stored ->
                crypto.openStrict(stored)?.toLongOrNull()
            } ?: 0L,
        )
    }

    /** Apply cloud prefs without bumping updatedAt (uses remote clock). */
    suspend fun applySyncedPreferences(remote: SyncedPreferences) {
        val mode = ThemeMode.fromStorageKey(remote.themeMode)
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.CURRENCY, remote.currency)
            preferences[PreferencesKeys.LANGUAGE] = remote.locale
            preferences[PreferencesKeys.THEME_MODE] = mode.storageKey
            when (mode) {
                ThemeMode.LIGHT, ThemeMode.LAVENDER, ThemeMode.SOFT_LIGHT ->
                    preferences[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN, ThemeMode.FOREST, ThemeMode.SUNSET ->
                    preferences[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
            // Onboarding only ever moves false -> true; never let a stale/legacy remote doc re-trigger it.
            if (remote.onboardingComplete) {
                preferences.putSealedBoolean(PreferencesKeys.ONBOARDING_COMPLETE, true)
                preferences.remove(PreferencesKeys.LEGACY_ONBOARDING)
            }
            preferences.putSealedBoolean(PreferencesKeys.DAILY_REMINDER, remote.dailyReminder)
            preferences.remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
            preferences.putSealedInt(
                PreferencesKeys.REMINDER_HOUR,
                remote.reminderHour.coerceIn(0, 23),
            )
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            preferences.putSealedInt(
                PreferencesKeys.REMINDER_MINUTE,
                remote.reminderMinute.coerceIn(0, 59),
            )
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
            preferences.putSealed(PreferencesKeys.ANALYTICS_PERIOD, remote.analyticsPeriod)
            if (remote.monthlyBudget == null || remote.monthlyBudget <= 0) {
                preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                preferences.putSealed(PreferencesKeys.MONTHLY_BUDGET, remote.monthlyBudget.toString())
            }
            preferences.putSealed(
                PreferencesKeys.PREFERENCES_UPDATED_AT,
                remote.updatedAt.toString(),
            )
        }
    }

    private fun MutablePreferences.putSealed(key: Preferences.Key<String>, plain: String) {
        this[key] = crypto.seal(plain)
    }

    private fun MutablePreferences.putSealedBoolean(key: Preferences.Key<String>, value: Boolean) {
        this[key] = crypto.sealBoolean(value)
    }

    private fun MutablePreferences.putSealedInt(key: Preferences.Key<String>, value: Int) {
        this[key] = crypto.sealInt(value)
    }

    // ---- Pending expense submission journal (DATA-2) -------------------------------
    //
    // A durable multi-entry journal of unresolved submission attempts, backed by a
    // DataStore string-set of sealed "operationId|createdAt" members. The behavioral
    // policy (append/complete/reconcile decisions) lives in [PendingExpenseJournal],
    // shared verbatim with test fakes so the two cannot drift.

    private fun Preferences.pendingExpenseEntries(): List<PendingExpenseOperation> =
        (this[PreferencesKeys.PENDING_EXPENSE_OPERATIONS] ?: emptySet()).mapNotNull { it.openJournalEntry() }

    private fun String.openJournalEntry(): PendingExpenseOperation? {
        val plain = crypto.open(this) ?: return null
        val separator = plain.indexOf(ENTRY_FIELD_SEPARATOR)
        if (separator <= 0) return null
        val operationId = plain.take(separator)
        val createdAt = plain.substring(separator + 1).toLongOrNull() ?: return null
        if (operationId.isBlank()) return null
        return PendingExpenseOperation(operationId, createdAt)
    }

    private fun PendingExpenseOperation.sealJournalEntry(): String =
        crypto.seal("$operationId$ENTRY_FIELD_SEPARATOR$createdAt")

    private fun MutablePreferences.putPendingExpenseEntries(entries: List<PendingExpenseOperation>) {
        if (entries.isEmpty()) {
            remove(PreferencesKeys.PENDING_EXPENSE_OPERATIONS)
        } else {
            this[PreferencesKeys.PENDING_EXPENSE_OPERATIONS] = entries.map { it.sealJournalEntry() }.toSet()
        }
    }

    /** The legacy single-slot entry, if one is still present and readable. */
    private fun Preferences.legacyPendingExpenseEntry(): PendingExpenseOperation? {
        val operationId = crypto.open(this[PreferencesKeys.PENDING_EXPENSE_OPERATION_ID])
        if (operationId.isNullOrBlank()) return null
        // A missing/unreadable timestamp must not instantly age the entry out: give it
        // a full grace period rather than silently losing the pending state.
        val createdAt = crypto.open(this[PreferencesKeys.PENDING_EXPENSE_CREATED_AT])
            ?.toLongOrNull() ?: System.currentTimeMillis()
        return PendingExpenseOperation(operationId, createdAt)
    }

    /**
     * Normalize journal storage inside an edit: fold the legacy single-slot entry into
     * the multi-entry set (preserving its original createdAt) and drop corrupted
     * members — an entry that cannot be decrypted can never be reconciled, and keeping
     * it would make every later read silently re-observe it. Returns the current
     * entries after normalization.
     */
    private fun MutablePreferences.normalizePendingExpenseJournal(): List<PendingExpenseOperation> {
        val raw = this[PreferencesKeys.PENDING_EXPENSE_OPERATIONS] ?: emptySet()
        val entries = raw.mapNotNull { it.openJournalEntry() }
        if (entries.size != raw.size) putPendingExpenseEntries(entries)

        val legacy = legacyPendingExpenseEntry()
        if (legacy != null) {
            remove(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID)
            remove(PreferencesKeys.PENDING_EXPENSE_CREATED_AT)
            if (entries.none { it.operationId == legacy.operationId }) {
                putPendingExpenseEntries(PendingExpenseJournal.append(entries, legacy))
                return entries + legacy
            }
        }
        return entries
    }

    /**
     * Mint and durably persist a fresh operation id for one explicit user submission.
     *
     * Identity here is a single submission *attempt*, never the expense's field values:
     * two transactions with identical amount/category/note/type entered seconds apart
     * are two legitimate, independent records. This always mints a new id and never
     * looks at (or is passed) the expense's field values, so two calls always identify
     * two distinct operations — see DATA-1. A genuine retry of the *same* attempt (e.g.
     * a transient-error retry still inside the same save() call) simply reuses the id
     * the caller already has; nothing here needs to be re-consulted for that case.
     *
     * The journal is multi-entry (DATA-2): beginning B never overwrites an unresolved
     * A. A single-slot journal would make A unreconcilable the moment B began, even
     * though A's write may have already landed (or may land later).
     */
    override suspend fun beginExpenseSubmission(): String {
        val operationId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        context.dataStore.edit { preferences ->
            val entries = preferences.normalizePendingExpenseJournal()
            preferences.putPendingExpenseEntries(
                PendingExpenseJournal.append(entries, PendingExpenseOperation(operationId, now)),
            )
        }
        return operationId
    }

    /**
     * Forget exactly one submission's bookkeeping once its outcome (success or
     * otherwise) is known. A late completion of an earlier attempt never erases a
     * newer, still-unresolved operation.
     */
    override suspend fun completeExpenseSubmission(operationId: String) {
        context.dataStore.edit { preferences ->
            val entries = preferences.normalizePendingExpenseJournal()
            val updated = PendingExpenseJournal.complete(entries, operationId)
            if (updated.size != entries.size) {
                preferences.putPendingExpenseEntries(updated)
            }
        }
    }

    /**
     * Resolve pending entries left behind by a process death between a Firestore write
     * acknowledging and [completeExpenseSubmission] running.
     *
     * Every unresolved entry is enumerated (DATA-2) and asked independently — via
     * [exists] — whether that exact operation's document is already present
     * server-side. If so, the write already succeeded and the entry is only bookkeeping
     * now; it is removed. This never attempts a write itself: it cannot resubmit a
     * transaction whose write never reached the server (the field values were
     * deliberately never persisted here), so such an entry is left alone until it ages
     * past the cleanup grace period, then dropped. Either outcome is safe: a genuinely
     * new, later submission always mints its own fresh id via [beginExpenseSubmission]
     * and can never be matched against — let alone collapsed into — a leftover entry
     * from here.
     */
    override suspend fun reconcilePendingExpenseSubmissions(exists: suspend (String) -> Boolean) {
        val snapshot = context.dataStore.data.first()
        // Enumerate from the snapshot, folding in a legacy single-slot entry that no
        // edit has migrated yet, so an upgraded install's first reconciliation still
        // sees and resolves it.
        val legacy = snapshot.legacyPendingExpenseEntry()
        val pending = snapshot.pendingExpenseEntries().let { entries ->
            if (legacy != null && entries.none { it.operationId == legacy.operationId }) {
                entries + legacy
            } else {
                entries
            }
        }
        if (pending.isEmpty()) return

        val resolved = PendingExpenseJournal.resolvedForRemoval(pending, System.currentTimeMillis(), exists)
        if (resolved.isEmpty()) return

        context.dataStore.edit { preferences ->
            val current = preferences.normalizePendingExpenseJournal()
            val updated = current.filterNot { entry ->
                resolved.any { it.operationId == entry.operationId }
            }
            if (updated.size != current.size) {
                preferences.putPendingExpenseEntries(updated)
            }
        }
    }

    private suspend fun touchEdit(block: MutablePreferences.() -> Unit) {
        context.dataStore.edit { preferences ->
            preferences.block()
            val previous = crypto.open(preferences[PreferencesKeys.PREFERENCES_UPDATED_AT])
                ?.toLongOrNull() ?: 0L
            val next = maxOf(System.currentTimeMillis(), previous + 1L)
            preferences.putSealed(PreferencesKeys.PREFERENCES_UPDATED_AT, next.toString())
        }
    }

    suspend fun updateCurrency(currency: String) {
        touchEdit { putSealed(PreferencesKeys.CURRENCY, currency) }
    }

    suspend fun updateThemeMode(mode: ThemeMode) {
        touchEdit {
            this[PreferencesKeys.THEME_MODE] = mode.storageKey
            when (mode) {
                ThemeMode.LIGHT, ThemeMode.LAVENDER, ThemeMode.SOFT_LIGHT ->
                    this[PreferencesKeys.DARK_MODE] = false
                ThemeMode.DARK, ThemeMode.AMOLED, ThemeMode.MIDNIGHT, ThemeMode.OCEAN, ThemeMode.FOREST, ThemeMode.SUNSET ->
                    this[PreferencesKeys.DARK_MODE] = true
                ThemeMode.SYSTEM -> Unit
            }
        }
    }

    suspend fun setOnboardingComplete() {
        touchEdit {
            putSealedBoolean(PreferencesKeys.ONBOARDING_COMPLETE, true)
            remove(PreferencesKeys.LEGACY_ONBOARDING)
        }
    }

    suspend fun updateDailyReminder(enabled: Boolean) {
        touchEdit {
            putSealedBoolean(PreferencesKeys.DAILY_REMINDER, enabled)
            remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
        }
    }

    suspend fun updateReminderTime(hour: Int, minute: Int) {
        touchEdit {
            putSealedInt(PreferencesKeys.REMINDER_HOUR, hour.coerceIn(0, 23))
            putSealedInt(PreferencesKeys.REMINDER_MINUTE, minute.coerceIn(0, 59))
            remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
        }
    }

    suspend fun updateAnalyticsPeriod(period: AnalyticsPeriod) {
        updateAnalyticsPeriodKey(period.storageKey)
    }

    override suspend fun updateAnalyticsPeriodKey(storageKey: String) {
        touchEdit { putSealed(PreferencesKeys.ANALYTICS_PERIOD, storageKey) }
    }

    suspend fun updateMonthlyBudget(amount: Double?) {
        touchEdit {
            if (amount == null || amount <= 0) {
                remove(PreferencesKeys.MONTHLY_BUDGET)
            } else {
                putSealed(PreferencesKeys.MONTHLY_BUDGET, amount.toString())
            }
        }
    }

    suspend fun setLastCloudSyncAt(millis: Long) {
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.LAST_CLOUD_SYNC_AT, millis.toString())
        }
    }

    suspend fun updateLanguage(languageCode: String) {
        touchEdit { this[PreferencesKeys.LANGUAGE] = languageCode }
    }

    /**
     * Drop account-scoped local prefs on sign-out / account deletion so the next
     * user on a shared device does not see budget or sync metadata. Theme and
     * language stay as device chrome. Firestore offline cache is cleared
     * separately via [FirestoreClient.clearOfflineCache].
     */
    suspend fun clearAccountLocalState() {
        context.dataStore.edit { preferences ->
            preferences.remove(PreferencesKeys.MONTHLY_BUDGET)
            preferences.remove(PreferencesKeys.LAST_CLOUD_SYNC_AT)
            preferences.remove(PreferencesKeys.PREFERENCES_UPDATED_AT)
            preferences.remove(PreferencesKeys.CURRENCY)
            preferences.remove(PreferencesKeys.ANALYTICS_PERIOD)
            preferences.remove(PreferencesKeys.ONBOARDING_COMPLETE)
            preferences.remove(PreferencesKeys.LEGACY_ONBOARDING)
            preferences.remove(PreferencesKeys.DAILY_REMINDER)
            preferences.remove(PreferencesKeys.LEGACY_DAILY_REMINDER)
            preferences.remove(PreferencesKeys.REMINDER_HOUR)
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_HOUR)
            preferences.remove(PreferencesKeys.REMINDER_MINUTE)
            preferences.remove(PreferencesKeys.LEGACY_REMINDER_MINUTE)
            // The whole pending-submission journal — new multi-entry set and any
            // legacy single-slot leftovers (DATA-2).
            preferences.remove(PreferencesKeys.PENDING_EXPENSE_OPERATIONS)
            preferences.remove(PreferencesKeys.PENDING_EXPENSE_OPERATION_ID)
            preferences.remove(PreferencesKeys.PENDING_EXPENSE_CREATED_AT)
        }
        // See STOR-1: a CSV export is app-private cache, not DataStore, but this is the
        // one function both sign-out and account deletion already call to clear local
        // account state, so it closes both paths with a single edit. Best-effort: a
        // cache-delete failure here must never prevent the caller's subsequent
        // Firestore offline-cache clear from running.
        runCatching { ExportUtils.clearExportCache(context) }
            .onFailure { e -> Log.w(TAG, "clearExportCache failed", e) }
    }

    /** Ensure local LWW clock is non-zero before first cloud seed. */
    suspend fun ensurePreferencesTimestamp(): Long {
        val current = preferencesUpdatedAt()
        if (current > 0L) return current
        val now = System.currentTimeMillis()
        context.dataStore.edit { preferences ->
            preferences.putSealed(PreferencesKeys.PREFERENCES_UPDATED_AT, now.toString())
        }
        return now
    }

    companion object {
        private const val TAG = "PreferenceManager"

        /** Journal member encoding: sealed "operationId|createdAt" (UUIDs contain no '|'). */
        private const val ENTRY_FIELD_SEPARATOR = '|'
    }
}

/** Shared shape with web `SyncedPreferences` at users/{uid}/settings/preferences. */
data class SyncedPreferences(
    val currency: String,
    val locale: String,
    val themeMode: String,
    val onboardingComplete: Boolean,
    val dailyReminder: Boolean,
    val reminderHour: Int,
    val reminderMinute: Int,
    val analyticsPeriod: String,
    val monthlyBudget: Double?,
    val updatedAt: Long,
)
