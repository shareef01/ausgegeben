package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.util.BackupFormat
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.OccurrenceReceipt
import com.aus.ausgegeben.util.RecurringBackupSection
import com.aus.ausgegeben.util.ReplacePlanner
import com.aus.ausgegeben.util.RestoreBatches
import com.aus.ausgegeben.util.RestoreUtils
import com.aus.ausgegeben.util.SafetySnapshot
import com.aus.ausgegeben.util.runSuspendCatching
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToLong
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.tasks.await

/**
 * Records per safety-snapshot document, matching web's restoreLimits.ts. 300 keeps a
 * worst-case chunk (2,000-character notes plus every bounded legacy field) under
 * Firestore's 1 MiB document limit.
 */
internal const val SNAPSHOT_CHUNK_SIZE = 300

/**
 * Most expense or receipt chunks one snapshot may have. firestore.rules accepts only
 * chunk_0..99 and receipt_chunk_0..99, which caps how much one account can park in
 * restoreSnapshot; keep the two in step.
 */
internal const val MAX_SNAPSHOT_CHUNKS = 100

/**
 * What [BackupRestoreRepository] borrows from [AppRepository]: Firestore paths, the
 * signed-in user, the document mappers and the budget/recurring writers. Implemented by
 * a private object inside AppRepository, so those helpers stay private there and the
 * moved code keeps calling them unqualified, through interface delegation.
 */
internal interface BackupRestoreHost {
    val firestore: FirebaseFirestore
    fun uid(): String?
    fun requireVerifiedEmail()
    fun catCol(uid: String): CollectionReference
    fun catDoc(uid: String, id: String): DocumentReference
    fun expCol(uid: String): CollectionReference
    fun expDoc(uid: String, id: String): DocumentReference
    fun budgetCol(u: String): CollectionReference
    fun settingsPrefsDoc(uid: String): DocumentReference
    fun restoreOpDoc(uid: String): DocumentReference
    fun snapshotCol(uid: String): CollectionReference
    fun snapshotDoc(uid: String, id: String): DocumentReference
    fun categoryFromDoc(doc: DocumentSnapshot): Category?
    fun expenseFromDoc(doc: DocumentSnapshot): Expense?
    fun legacyExpenseFields(m: Map<String, Any?>): Map<String, Any>
    fun roundAmount(amount: Double): Double
    suspend fun getCategoryBudgets(u: String): List<com.aus.ausgegeben.data.entity.CategoryBudget>
    suspend fun getRecurringBackupSection(u: String): RecurringBackupSection
    suspend fun applyBudgetCollection(u: String, budgets: List<com.aus.ausgegeben.data.entity.CategoryBudget>, replace: Boolean)
    suspend fun applyRecurringCollection(u: String, section: RecurringBackupSection, replace: Boolean)
}

/**
 * Backup restore (merge) and the journalled Replace: planning, the recovery lease, the
 * Firestore safety snapshot, execution, resume and rollback. Moved out of AppRepository
 * unchanged; AppRepository forwards its public backup functions here, so callers and
 * tests are unaffected.
 */
internal class BackupRestoreRepository(
    private val host: BackupRestoreHost,
    private val preferenceManager: PreferenceManager,
) : BackupRestoreHost by host {
    private val activeReplaceOperations = ConcurrentHashMap.newKeySet<String>()

    suspend fun restoreBackup(
        backup: BackupFormat.ParsedBackup,
        expectedUid: String,
    ): Result<RestoreUtils.RestoreResult> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        if (u != expectedUid) {
            throw IllegalStateException("AUTH_ACCOUNT_CHANGED")
        }
        requireVerifiedEmail()

        // AUD-005 pre-flight: the preferences write is the LAST step, and the rules require
        // its revision to exceed whatever is already stored while also staying inside their
        // five-minute future window. Work that out from the stored document now, so an
        // unwritable window refuses the restore before a single category or expense lands.
        val storedPreferencesRevision = settingsPrefsDoc(u).get(Source.SERVER).await()
            .getLong("updatedAt")
        val newTimestamp = BackupFormat.writablePreferencesRevision(
            backup.preferences.preferencesUpdatedAt,
            storedPreferencesRevision,
        ) ?: throw IllegalStateException("PREFERENCES_REVISION_UNWRITABLE")

        // Pre-flight check: query categories to detect conflicting transactionType
        val existingCatsSnap = catCol(u).get().await()
        val existingCatsById = existingCatsSnap.documents.associateBy { it.id }

        for (c in backup.categories) {
            val existing = existingCatsById[c.id] ?: continue
            val existingType = existing.getString("transactionType")
            if (existingType != null && existingType != c.transactionType) {
                throw IllegalStateException("CATEGORY_TYPE_CONFLICT: ${c.name}")
            }
            // The merge leaves these markers in place, and the rules refuse new expenses for
            // a category being deleted and budgets for one being migrated, so the restore
            // failed only after the categories and earlier batches were written (web parity).
            if (existing.getString("deletionState") == "deleting" ||
                existing.getString("migrationState") == "migrating"
            ) {
                throw IllegalStateException("CATEGORY_BUSY: ${c.name}")
            }
        }

        // 1. Categories, chunked by the rules' per-batch document-access budget: a
        // non-expense category makes the update rule read categoryBudgets (AUD-001).
        val categoryChunks = RestoreBatches.chunkByBudgetCheck(backup.categories, 400) {
            it.transactionType != "expense"
        }
        for (chunk in categoryChunks) {
            val batch = firestore.batch()
            for (c in chunk) {
                val ref = catDoc(u, c.id)
                val payload = buildMap<String, Any> {
                    put("name", c.name.trim().take(80))
                    put("iconName", c.iconName.take(63))
                    put("colorInt", c.colorInt.toLong())
                    put("transactionType", c.transactionType)
                    put("sortOrder", c.sortOrder)
                    put("updatedAt", BackupFormat.restoredCategoryRevision(c.updatedAt))
                    put("id", c.id)
                }
                batch.set(ref, payload, SetOptions.merge())
            }
            batch.commit().await()
        }

        // 2. Expenses in chunks the rules' per-batch read limit accepts
        val expenseChunks = RestoreBatches.chunkByCategory(backup.expenses, 400) { it.categoryId }
        for (chunk in expenseChunks) {
            val batch = firestore.batch()
            for (e in chunk) {
                val ref = expDoc(u, e.id)
                val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
                val payload = buildMap<String, Any> {
                    put("amount", roundedAmount)
                    put("dateMillis", e.dateMillis)
                    put("categoryId", e.categoryId)
                    // 2000 is the rules' and every other writer's cap; 200 silently cut notes.
                    put("note", e.note.take(2000))
                    put("transactionType", e.transactionType)
                    // A restore is a new write: the rules deny an updatedAt older than the
                    // stored row, so the backup's own clock failed any merge over an edit.
                    put("updatedAt", System.currentTimeMillis())
                    put("id", e.id)
                }
                batch.set(ref, payload, SetOptions.merge())
            }
            batch.commit().await()
        }

        // 3. Preferences — `newTimestamp` was computed and validated in the pre-flight above.
        val validCurrencies = setOf("EUR", "USD", "GBP", "CHF")
        val validLocales = setOf("en", "de")
        val validThemes = setOf(
            "light", "dark", "system", "amoled", "midnight",
            "ocean", "forest", "sunset", "lavender", "soft_light"
        )
        val cur = if (backup.preferences.currency in validCurrencies) backup.preferences.currency else "EUR"
        val loc = if (backup.preferences.locale in validLocales) backup.preferences.locale else "en"
        val theme = if (backup.preferences.themeMode in validThemes) backup.preferences.themeMode else "system"
        if (backup.schemaVersion >= 2) applyBudgetCollection(expectedUid, backup.categoryBudgets, false)
        if (backup.schemaVersion == 3 && backup.recurring != null) {
            applyRecurringCollection(expectedUid, backup.recurring, false)
        }

        val budget = backup.preferences.monthlyBudget?.takeIf { it > 0.0 && it < 1_000_000_000.0 }
            ?.let(CurrencyUtils::roundAmount)

        // Backups carry no reminder or analytics-period settings, so keep this device's
        // (as web restore does). Hard-coded defaults here re-enabled a reminder the user
        // had switched off and reset it to 19:00 on every merge restore.
        val current = preferenceManager.snapshotSyncedPreferences()
        val syncedPrefs = SyncedPreferences(
            currency = cur,
            locale = loc,
            themeMode = theme,
            onboardingComplete = true,
            dailyReminder = current.dailyReminder,
            reminderHour = current.reminderHour,
            reminderMinute = current.reminderMinute,
            analyticsPeriod = current.analyticsPeriod,
            monthlyBudget = budget,
            updatedAt = newTimestamp,
        )

        settingsPrefsDoc(u).set(
            buildMap<String, Any?> {
                put("currency", cur)
                put("locale", loc)
                put("themeMode", theme)
                put("onboardingComplete", true)
                put("dailyReminder", syncedPrefs.dailyReminder)
                put("reminderHour", syncedPrefs.reminderHour)
                put("reminderMinute", syncedPrefs.reminderMinute)
                put("analyticsPeriod", syncedPrefs.analyticsPeriod)
                put("monthlyBudget", budget)
                put("updatedAt", newTimestamp)
            },
            SetOptions.merge()
        ).await()

        preferenceManager.applySyncedPreferences(syncedPrefs)

        RestoreUtils.RestoreResult(
            success = true,
            expensesRestored = backup.expenses.size,
            categoriesRestored = backup.categories.size,
            preferencesRestored = true,
        )
    }

    suspend fun planReplace(backup: BackupFormat.ParsedBackup): Result<ReplacePlanner.ReplacePlan> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val expSnap = expCol(u).get().await()
        val currentExpenses = expSnap.documents.mapNotNull { expenseFromDoc(it) }

        val catSnap = catCol(u).get().await()
        val currentCategories = catSnap.documents.mapNotNull { categoryFromDoc(it) }

        val prefDoc = settingsPrefsDoc(u).get().await()
        val currentPrefs = if (prefDoc.exists()) {
            SyncedPreferences(
                currency = prefDoc.getString("currency") ?: "EUR",
                locale = prefDoc.getString("locale") ?: "en",
                themeMode = prefDoc.getString("themeMode") ?: "system",
                onboardingComplete = prefDoc.getBoolean("onboardingComplete") ?: true,
                dailyReminder = prefDoc.getBoolean("dailyReminder") ?: true,
                reminderHour = (prefDoc.getLong("reminderHour") ?: 19L).toInt(),
                reminderMinute = (prefDoc.getLong("reminderMinute") ?: 0L).toInt(),
                analyticsPeriod = prefDoc.getString("analyticsPeriod") ?: "this_month",
                monthlyBudget = prefDoc.getDouble("monthlyBudget"),
                updatedAt = prefDoc.getLong("updatedAt") ?: System.currentTimeMillis(),
            )
        } else null

        ReplacePlanner.planReplace(
            currentExpenses = currentExpenses,
            currentCategories = currentCategories,
            currentPreferences = currentPrefs,
            backup = backup,
        )
    }

    suspend fun getRestoreOperation(expectedUid: String? = null): ReplacePlanner.RestoreOperationDoc? {
        val u = expectedUid ?: uid() ?: return null
        val snap = restoreOpDoc(u).get().await()
        if (!snap.exists()) return null
        val phaseStr = snap.getString("phase") ?: return null
        val phase = try {
            ReplacePlanner.RestorePhase.valueOf(phaseStr)
        } catch (_: Exception) {
            return null
        }
        val countsMap = snap.get("plannedCounts") as? Map<*, *>
        val plannedCounts = if (countsMap != null) {
            ReplacePlanner.PlannedCounts(
                backupExpenseCount = (countsMap["backupExpenseCount"] as? Number)?.toInt() ?: 0,
                backupCategoryCount = (countsMap["backupCategoryCount"] as? Number)?.toInt() ?: 0,
                expensesToUpsertCount = (countsMap["expensesToUpsertCount"] as? Number)?.toInt() ?: 0,
                expensesToDeleteCount = (countsMap["expensesToDeleteCount"] as? Number)?.toInt() ?: 0,
                categoriesToUpsertCount = (countsMap["categoriesToUpsertCount"] as? Number)?.toInt() ?: 0,
                categoriesPreservedCount = (countsMap["categoriesPreservedCount"] as? Number)?.toInt() ?: 0,
            )
        } else null

        val progressMap = snap.get("progress") as? Map<*, *>
        val progress = if (progressMap != null) {
            ReplacePlanner.RestoreJournalProgress(
                step = progressMap["step"] as? String,
                batchIndex = (progressMap["batchIndex"] as? Number)?.toInt(),
                totalBatches = (progressMap["totalBatches"] as? Number)?.toInt(),
                lastProcessedId = progressMap["lastProcessedId"] as? String,
                leaseHolder = progressMap["leaseHolder"] as? String,
                leaseExpiresAt = (progressMap["leaseExpiresAt"] as? Number)?.toLong(),
                fencingToken = (progressMap["fencingToken"] as? Number)?.toLong(),
            )
        } else null

        val snapMetaMap = snap.get("snapshotMeta") as? Map<*, *>
        val snapshotMeta = if (snapMetaMap != null) {
            ReplacePlanner.SnapshotMeta(
                chunkCount = (snapMetaMap["chunkCount"] as? Number)?.toInt() ?: 1,
                totalExpenses = (snapMetaMap["totalExpenses"] as? Number)?.toInt() ?: 0,
                totalCategories = (snapMetaMap["totalCategories"] as? Number)?.toInt() ?: 0,
                receiptChunkCount = (snapMetaMap["receiptChunkCount"] as? Number)?.toInt() ?: 0,
                totalReceipts = (snapMetaMap["totalReceipts"] as? Number)?.toInt() ?: 0,
            )
        } else null

        return ReplacePlanner.RestoreOperationDoc(
            operationId = snap.getString("operationId") ?: "",
            ownerUid = snap.getString("ownerUid") ?: u,
            mode = snap.getString("mode") ?: "replace",
            backupFingerprint = snap.getString("backupFingerprint") ?: "",
            phase = phase,
            createdAt = snap.getLong("createdAt") ?: 0L,
            updatedAt = snap.getLong("updatedAt") ?: 0L,
            plannedCounts = plannedCounts,
            progress = progress,
            snapshotMeta = snapshotMeta,
            error = snap.getString("error"),
            failedFromPhase = snap.getString("failedFromPhase")?.let {
                try { ReplacePlanner.RestorePhase.valueOf(it) } catch (_: Exception) { null }
            },
            initiatorPlatform = snap.getString("initiatorPlatform") ?: "android",
        )
    }

    private suspend fun setRestoreOperation(u: String, op: ReplacePlanner.RestoreOperationDoc) {
        val payload = buildMap<String, Any?> {
            put("operationId", op.operationId)
            put("ownerUid", op.ownerUid)
            put("mode", op.mode)
            put("backupFingerprint", op.backupFingerprint)
            put("phase", op.phase.name)
            put("createdAt", op.createdAt)
            put("updatedAt", op.updatedAt)
            put("initiatorPlatform", op.initiatorPlatform)
            op.error?.let { put("error", it.take(500)) }
            op.failedFromPhase?.let { put("failedFromPhase", it.name) }
            op.plannedCounts?.let { counts ->
                put(
                    "plannedCounts",
                    mapOf(
                        "backupExpenseCount" to counts.backupExpenseCount,
                        "backupCategoryCount" to counts.backupCategoryCount,
                        "expensesToUpsertCount" to counts.expensesToUpsertCount,
                        "expensesToDeleteCount" to counts.expensesToDeleteCount,
                        "categoriesToUpsertCount" to counts.categoriesToUpsertCount,
                        "categoriesPreservedCount" to counts.categoriesPreservedCount,
                    ),
                )
            }
            op.progress?.let { prog ->
                put(
                    "progress",
                    buildMap<String, Any?> {
                        prog.step?.let { put("step", it) }
                        prog.batchIndex?.let { put("batchIndex", it) }
                        prog.totalBatches?.let { put("totalBatches", it) }
                        prog.lastProcessedId?.let { put("lastProcessedId", it) }
                        prog.leaseHolder?.let { put("leaseHolder", it) }
                        prog.leaseExpiresAt?.let { put("leaseExpiresAt", it) }
                        prog.fencingToken?.let { put("fencingToken", it) }
                    },
                )
            }
            op.snapshotMeta?.let { meta ->
                put(
                    "snapshotMeta",
                    mapOf(
                        "chunkCount" to meta.chunkCount,
                        "totalExpenses" to meta.totalExpenses,
                        "totalCategories" to meta.totalCategories,
                        "receiptChunkCount" to meta.receiptChunkCount,
                        "totalReceipts" to meta.totalReceipts,
                    ),
                )
            }
        }
        restoreOpDoc(u).set(payload).await()
    }

    private suspend fun deleteSafetySnapshot(u: String) {
        val col = snapshotCol(u)
        val snap = col.get().await()
        if (snap.isEmpty) return
        for (chunk in snap.documents.chunked(400)) {
            val batch = firestore.batch()
            chunk.forEach { batch.delete(it.reference) }
            batch.commit().await()
        }
    }

    private data class LeaseAcquisitionResult(
        val fencingToken: Long,
        val operationId: String,
        val existingOp: ReplacePlanner.RestoreOperationDoc?,
    )

    private suspend fun acquireRecoveryLease(
        expectedUid: String,
        holderId: String,
        isResume: Boolean,
    ): LeaseAcquisitionResult {
        val opRef = restoreOpDoc(expectedUid)
        return firestore.runTransaction { tx ->
            val snap = tx.get(opRef)
            val now = System.currentTimeMillis()
            var fencingToken = 1L
            var existingOp: ReplacePlanner.RestoreOperationDoc? = null
            var operationId = "replace_${now}_${UUID.randomUUID().toString().take(6)}"

            if (snap.exists()) {
                val phaseStr = snap.getString("phase")
                val phase = try {
                    phaseStr?.let { ReplacePlanner.RestorePhase.valueOf(it) } ?: ReplacePlanner.RestorePhase.PREPARING
                } catch (_: Exception) {
                    ReplacePlanner.RestorePhase.PREPARING
                }
                val countsMap = snap.get("plannedCounts") as? Map<*, *>
                val plannedCounts = if (countsMap != null) {
                    ReplacePlanner.PlannedCounts(
                        backupExpenseCount = (countsMap["backupExpenseCount"] as? Number)?.toInt() ?: 0,
                        backupCategoryCount = (countsMap["backupCategoryCount"] as? Number)?.toInt() ?: 0,
                        expensesToUpsertCount = (countsMap["expensesToUpsertCount"] as? Number)?.toInt() ?: 0,
                        expensesToDeleteCount = (countsMap["expensesToDeleteCount"] as? Number)?.toInt() ?: 0,
                        categoriesToUpsertCount = (countsMap["categoriesToUpsertCount"] as? Number)?.toInt() ?: 0,
                        categoriesPreservedCount = (countsMap["categoriesPreservedCount"] as? Number)?.toInt() ?: 0,
                    )
                } else null

                val progressMap = snap.get("progress") as? Map<*, *>
                val progress = if (progressMap != null) {
                    ReplacePlanner.RestoreJournalProgress(
                        step = progressMap["step"] as? String,
                        batchIndex = (progressMap["batchIndex"] as? Number)?.toInt(),
                        totalBatches = (progressMap["totalBatches"] as? Number)?.toInt(),
                        lastProcessedId = progressMap["lastProcessedId"] as? String,
                        leaseHolder = progressMap["leaseHolder"] as? String,
                        leaseExpiresAt = (progressMap["leaseExpiresAt"] as? Number)?.toLong(),
                        fencingToken = (progressMap["fencingToken"] as? Number)?.toLong(),
                    )
                } else null

                val snapMetaMap = snap.get("snapshotMeta") as? Map<*, *>
                val snapshotMeta = if (snapMetaMap != null) {
                    ReplacePlanner.SnapshotMeta(
                        chunkCount = (snapMetaMap["chunkCount"] as? Number)?.toInt() ?: 1,
                        totalExpenses = (snapMetaMap["totalExpenses"] as? Number)?.toInt() ?: 0,
                        totalCategories = (snapMetaMap["totalCategories"] as? Number)?.toInt() ?: 0,
                        receiptChunkCount = (snapMetaMap["receiptChunkCount"] as? Number)?.toInt() ?: 0,
                        totalReceipts = (snapMetaMap["totalReceipts"] as? Number)?.toInt() ?: 0,
                    )
                } else null

                existingOp = ReplacePlanner.RestoreOperationDoc(
                    operationId = snap.getString("operationId") ?: "",
                    ownerUid = snap.getString("ownerUid") ?: expectedUid,
                    mode = snap.getString("mode") ?: "replace",
                    backupFingerprint = snap.getString("backupFingerprint") ?: "",
                    phase = phase,
                    createdAt = snap.getLong("createdAt") ?: 0L,
                    updatedAt = snap.getLong("updatedAt") ?: 0L,
                    plannedCounts = plannedCounts,
                    progress = progress,
                    snapshotMeta = snapshotMeta,
                    error = snap.getString("error"),
                    failedFromPhase = snap.getString("failedFromPhase")?.let {
                        try { ReplacePlanner.RestorePhase.valueOf(it) } catch (_: Exception) { null }
                    },
                    initiatorPlatform = snap.getString("initiatorPlatform") ?: "android",
                )

                val isInFlight = existingOp.phase != ReplacePlanner.RestorePhase.COMPLETED &&
                    existingOp.phase != ReplacePlanner.RestorePhase.ROLLED_BACK
                val currentHolder = existingOp.progress?.leaseHolder
                val expiresAt = existingOp.progress?.leaseExpiresAt ?: 0L
                fencingToken = (existingOp.progress?.fencingToken ?: 0L) + 1L

                if (!isResume && isInFlight) {
                    if (currentHolder != null && currentHolder != holderId && expiresAt > now) {
                        throw IllegalStateException("CONCURRENT_OPERATION_LEASE_ACTIVE: Another client is actively processing this restore operation")
                    }
                    throw IllegalStateException("UNRESOLVED_RESTORE_OPERATION: ${existingOp.phase}")
                }

                if (isInFlight) {
                    if (currentHolder != null && currentHolder != holderId && expiresAt > now) {
                        throw IllegalStateException("CONCURRENT_OPERATION_LEASE_ACTIVE: Another client is actively processing this restore operation")
                    }
                    operationId = existingOp.operationId
                }
            }
            LeaseAcquisitionResult(fencingToken, operationId, existingOp)
        }.await()
    }

    private suspend fun verifyAndRenewRecoveryLease(
        expectedUid: String,
        holderId: String,
        fencingToken: Long,
    ) {
        val opRef = restoreOpDoc(expectedUid)
        val snap = opRef.get(Source.SERVER).await()
        if (!snap.exists()) {
            throw IllegalStateException("LEASE_LOST: Restore operation document was removed")
        }
        val progressMap = snap.get("progress") as? Map<*, *>
        val currentHolder = progressMap?.get("leaseHolder") as? String
        val currentToken = (progressMap?.get("fencingToken") as? Number)?.toLong() ?: 0L

        if (currentHolder != holderId) {
            throw IllegalStateException("LEASE_LOST: Lease was taken over by $currentHolder")
        }
        if (currentToken != fencingToken) {
            throw IllegalStateException("FENCING_TOKEN_MISMATCH: Expected token $fencingToken, got $currentToken")
        }
        val now = System.currentTimeMillis()
        val update = mapOf(
            "progress" to ((progressMap?.filterKeys { it != null } ?: emptyMap<Any?, Any?>()) + ("leaseExpiresAt" to (now + 60_000L))),
            "updatedAt" to now,
        )
        opRef.set(update, SetOptions.merge()).await()
    }

    private suspend fun createSafetySnapshot(
        u: String,
        operationId: String,
        expenses: List<Expense>,
        categories: List<Category>,
        preferences: SyncedPreferences?,
        expenseLegacyFields: Map<String, Map<String, Any>> = emptyMap(),
    ): ReplacePlanner.SnapshotMeta {
        val now = System.currentTimeMillis()
        val chunkSize = SNAPSHOT_CHUNK_SIZE
        val chunkCount = if (expenses.isEmpty()) 1 else (expenses.size + chunkSize - 1) / chunkSize

        val currentRecurring = getRecurringBackupSection(u)
        val receiptsChunkSize = SNAPSHOT_CHUNK_SIZE
        val receiptChunkCount = if (currentRecurring.receipts.isEmpty()) 0 else (currentRecurring.receipts.size + receiptsChunkSize - 1) / receiptsChunkSize
        // Refuse before writing anything: the rules reject chunk_100 onward, and failing
        // here leaves the account untouched rather than with a partial snapshot.
        check(chunkCount <= MAX_SNAPSHOT_CHUNKS && receiptChunkCount <= MAX_SNAPSHOT_CHUNKS) { "SNAPSHOT_TOO_LARGE" }

        val metaPayload = buildMap<String, Any?> {
            put("operationId", operationId)
            put("ownerUid", u)
            put("createdAt", now)
            put("chunkCount", chunkCount)
            put("totalExpenses", expenses.size)
            put("totalCategories", categories.size)
            put("receiptChunkCount", receiptChunkCount)
            put("totalReceipts", currentRecurring.receipts.size)
            put("categoryBudgets", getCategoryBudgets(u).map { it.payload() + ("categoryId" to it.categoryId) })
            put("recurringTemplates", currentRecurring.templates.map { it.payload() + ("id" to it.id) })
            put(
                "preferences",
                preferences?.let {
                    buildMap<String, Any?> {
                        put("currency", it.currency)
                        put("locale", it.locale)
                        put("themeMode", it.themeMode)
                        put("onboardingComplete", it.onboardingComplete)
                        put("dailyReminder", it.dailyReminder)
                        put("reminderHour", it.reminderHour)
                        put("reminderMinute", it.reminderMinute)
                        put("analyticsPeriod", it.analyticsPeriod)
                        put("monthlyBudget", it.monthlyBudget)
                        put("updatedAt", it.updatedAt)
                    }
                } ?: emptyMap<String, Any>(),
            )
            put(
                "categories",
                categories.map { c ->
                    mapOf(
                        "id" to c.id,
                        "name" to c.name,
                        "iconName" to c.iconName,
                        "colorInt" to c.colorInt.toLong(),
                        "transactionType" to c.transactionType,
                        "sortOrder" to c.sortOrder.toLong(),
                        "updatedAt" to now,
                    )
                },
            )
        }
        snapshotDoc(u, "meta").set(metaPayload).await()

        for (i in 0 until receiptChunkCount) {
            val chunkReceipts = currentRecurring.receipts.drop(i * receiptsChunkSize).take(receiptsChunkSize)
            val chunkPayload = mapOf(
                "operationId" to operationId,
                "ownerUid" to u,
                "createdAt" to now,
                "chunkIndex" to i,
                "chunkCount" to receiptChunkCount,
                "recurringReceipts" to chunkReceipts.map { mapOf("id" to it.id, "templateId" to it.templateId, "scheduledDate" to it.scheduledDate, "expenseId" to it.expenseId, "createdAt" to it.createdAt) },
            )
            snapshotDoc(u, "receipt_chunk_$i").set(chunkPayload).await()
        }

        for (i in 0 until chunkCount) {
            val chunkExpenses = expenses.drop(i * chunkSize).take(chunkSize)
            val chunkPayload = mapOf(
                "operationId" to operationId,
                "ownerUid" to u,
                "createdAt" to now,
                "chunkIndex" to i,
                "chunkCount" to chunkCount,
                "expenses" to chunkExpenses.map { e ->
                    mapOf(
                        "id" to e.id,
                        "amount" to e.amount,
                        "dateMillis" to e.dateMillis,
                        "categoryId" to e.categoryId,
                        "note" to e.note,
                        "transactionType" to e.transactionType,
                        "deleted" to e.deleted,
                        "updatedAt" to now,
                    ) + expenseLegacyFields[e.id].orEmpty()
                },
            )
            snapshotDoc(u, "chunk_$i").set(chunkPayload).await()
        }

        val checkMeta = snapshotDoc(u, "meta").get().await()
        if (!checkMeta.exists()) {
            throw IllegalStateException("SNAPSHOT_VERIFICATION_FAILED: meta missing")
        }

        return ReplacePlanner.SnapshotMeta(
            chunkCount = chunkCount,
            totalExpenses = expenses.size,
            totalCategories = categories.size,
            receiptChunkCount = receiptChunkCount,
            totalReceipts = currentRecurring.receipts.size,
        )
    }

    private data class SnapshotData(
        val operationId: String,
        val expenses: List<Expense>,
        val expenseLegacyFields: Map<String, Map<String, Any>>,
        val categories: List<Category>,
        val preferences: SyncedPreferences?,
        val categoryBudgets: List<com.aus.ausgegeben.data.entity.CategoryBudget>?,
        val recurringTemplates: List<RecurringTemplate>?,
        val recurringReceipts: List<OccurrenceReceipt>?,
    )

    /**
     * Reads the safety snapshot back as authoritative state for a rollback (AUD-006).
     *
     * Every field goes through [SafetySnapshot], which is strict and fail-closed: a malformed
     * row throws `SNAPSHOT_INVALID: <path>` instead of being defaulted or dropped, because the
     * rollback writes what it reads back as the account's state (and deletes templates and
     * expenses that are not in it). The declared totals in the metadata are cross-checked
     * against what was actually read, so a truncated or mis-read chunk cannot silently shrink
     * the recovery set.
     */
    private suspend fun readSafetySnapshot(u: String): SnapshotData {
        val metaSnap = snapshotDoc(u, "meta").get(Source.SERVER).await()
        if (!metaSnap.exists()) {
            throw IllegalStateException("SNAPSHOT_NOT_FOUND")
        }
        val meta = metaSnap.data.orEmpty()
        val operationId = SafetySnapshot.operationId(meta)
        val chunkCount = SafetySnapshot.chunkCount(meta, "chunkCount")

        val categories = SafetySnapshot.categories(meta)
        SafetySnapshot.requireCount(
            SafetySnapshot.declaredCount(meta, "totalCategories"), categories.size, "meta.totalCategories",
        )
        val preferences = SafetySnapshot.preferences(meta)

        val expenses = mutableListOf<Expense>()
        val expenseLegacyFields = mutableMapOf<String, Map<String, Any>>()
        for (i in 0 until chunkCount) {
            val chunkSnap = snapshotDoc(u, "chunk_$i").get(Source.SERVER).await()
            check(chunkSnap.exists() && chunkSnap.getString("operationId") == operationId) { "SNAPSHOT_CHUNK_MISSING_OR_CHANGED" }
            for (row in SafetySnapshot.expenses(chunkSnap.data.orEmpty(), "chunk_$i") { legacyExpenseFields(it) }) {
                expenses.add(row.expense)
                if (row.legacy.isNotEmpty()) expenseLegacyFields[row.expense.id] = row.legacy
            }
        }
        SafetySnapshot.requireCount(
            SafetySnapshot.declaredCount(meta, "totalExpenses"), expenses.size, "meta.totalExpenses",
        )

        val budgets = SafetySnapshot.budgets(meta)
        val recurringTemplates = SafetySnapshot.templates(meta)

        val receiptChunkCount = SafetySnapshot.chunkCount(meta, "receiptChunkCount", default = 0)
        val recurringReceipts = if (receiptChunkCount > 0) {
            val collected = mutableListOf<OccurrenceReceipt>()
            for (i in 0 until receiptChunkCount) {
                val chunkSnap = snapshotDoc(u, "receipt_chunk_$i").get(Source.SERVER).await()
                // Fail closed like the expense chunks: rollback replaces the receipts
                // collection with this list, so a dropped chunk re-materialises occurrences.
                check(chunkSnap.exists() && chunkSnap.getString("operationId") == operationId) { "SNAPSHOT_CHUNK_MISSING_OR_CHANGED" }
                collected += SafetySnapshot.receipts(
                    chunkSnap.data.orEmpty()["recurringReceipts"], "receipt_chunk_$i.recurringReceipts",
                )
            }
            collected
        } else {
            SafetySnapshot.receipts(meta["recurringReceipts"], "meta.recurringReceipts")
        }
        SafetySnapshot.requireCount(
            SafetySnapshot.declaredCount(meta, "totalReceipts"), recurringReceipts.size, "meta.totalReceipts",
        )

        return SnapshotData(
            categoryBudgets = budgets,
            recurringTemplates = recurringTemplates,
            recurringReceipts = recurringReceipts,
            operationId = operationId,
            expenses = expenses,
            expenseLegacyFields = expenseLegacyFields,
            categories = categories,
            preferences = preferences,
        )
    }

    suspend fun executeReplace(
        backup: BackupFormat.ParsedBackup,
        expectedUid: String,
        faultHooks: ReplacePlanner.ReplaceFaultHooks? = null,
        isResume: Boolean = false,
    ): Result<ReplacePlanner.ReplaceResult> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        if (u != expectedUid) {
            throw IllegalStateException("AUTH_ACCOUNT_CHANGED")
        }
        requireVerifiedEmail()

        if (!activeReplaceOperations.add(expectedUid)) {
            throw IllegalStateException("RESTORE_OPERATION_ALREADY_IN_PROGRESS")
        }

        val currentClientId = "android_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"
        var currentPhase = ReplacePlanner.RestorePhase.PREPARING
        var operationId = "replace_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"
        var fencingToken = 1L
        var snapshotMeta: ReplacePlanner.SnapshotMeta? = null
        var initialCreatedAt = System.currentTimeMillis()

        try {
            val lease = acquireRecoveryLease(expectedUid, currentClientId, isResume)
            fencingToken = lease.fencingToken
            operationId = lease.operationId
            val existingOp = lease.existingOp

            if (!isResume && existingOp != null &&
                (existingOp.phase == ReplacePlanner.RestorePhase.COMPLETED || existingOp.phase == ReplacePlanner.RestorePhase.ROLLED_BACK)
            ) {
                deleteSafetySnapshot(expectedUid)
            }

            // Load authoritative current state
            val expSnap = expCol(expectedUid).get(Source.SERVER).await()
            val currentExpenses = expSnap.documents.mapNotNull { expenseFromDoc(it) }
            val currentLegacyFields = expSnap.documents
                .associate { it.id to legacyExpenseFields(it.data.orEmpty()) }
                .filterValues { it.isNotEmpty() }

            val catSnap = catCol(expectedUid).get(Source.SERVER).await()
            val currentCategories = catSnap.documents.mapNotNull { categoryFromDoc(it) }

            val prefDoc = settingsPrefsDoc(expectedUid).get(Source.SERVER).await()
            val currentPrefs = if (prefDoc.exists()) {
                SyncedPreferences(
                    currency = prefDoc.getString("currency") ?: "EUR",
                    locale = prefDoc.getString("locale") ?: "en",
                    themeMode = prefDoc.getString("themeMode") ?: "system",
                    onboardingComplete = prefDoc.getBoolean("onboardingComplete") ?: true,
                    dailyReminder = prefDoc.getBoolean("dailyReminder") ?: true,
                    reminderHour = (prefDoc.getLong("reminderHour") ?: 19L).toInt(),
                    reminderMinute = (prefDoc.getLong("reminderMinute") ?: 0L).toInt(),
                    analyticsPeriod = prefDoc.getString("analyticsPeriod") ?: "this_month",
                    monthlyBudget = prefDoc.getDouble("monthlyBudget"),
                    updatedAt = prefDoc.getLong("updatedAt") ?: System.currentTimeMillis(),
                )
            } else null

            val plan = ReplacePlanner.planReplace(
                currentExpenses = currentExpenses,
                currentCategories = currentCategories,
                currentPreferences = currentPrefs,
                backup = backup,
            )

            if (plan.conflicts.isNotEmpty()) {
                throw IllegalStateException("REPLACE_PLAN_CONFLICTS: ${plan.conflicts.joinToString("; ")}")
            }

            val fingerprint = ReplacePlanner.computeBackupFingerprint(backup)
            initialCreatedAt = if (isResume && existingOp != null) existingOp.createdAt else System.currentTimeMillis()

            val initialOp = ReplacePlanner.RestoreOperationDoc(
                operationId = operationId,
                ownerUid = expectedUid,
                mode = "replace",
                backupFingerprint = fingerprint,
                phase = ReplacePlanner.RestorePhase.PREPARING,
                createdAt = initialCreatedAt,
                updatedAt = System.currentTimeMillis(),
                plannedCounts = plan.counts,
                initiatorPlatform = "android",
                // setRestoreOperation replaces the whole journal: without this a resume
                // that died before SNAPSHOT_READY left no snapshotMeta, and the next
                // resume re-snapshotted the half-replaced account over the original.
                snapshotMeta = if (isResume) existingOp?.snapshotMeta else null,
                progress = ReplacePlanner.RestoreJournalProgress(
                    leaseHolder = currentClientId,
                    leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                    fencingToken = fencingToken,
                ),
            )
            setRestoreOperation(expectedUid, initialOp)

            snapshotMeta = if (isResume && existingOp?.snapshotMeta != null) existingOp.snapshotMeta else null
            if (snapshotMeta == null) {
                snapshotMeta = createSafetySnapshot(
                    u = expectedUid,
                    operationId = operationId,
                    expenses = currentExpenses,
                    categories = currentCategories,
                    preferences = currentPrefs,
                    expenseLegacyFields = currentLegacyFields,
                )
            }

            if (faultHooks?.failAfterSnapshot == true) {
                throw IllegalStateException("FAULT_INJECTED_AFTER_SNAPSHOT")
            }

            currentPhase = ReplacePlanner.RestorePhase.SNAPSHOT_READY
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.SNAPSHOT_READY,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
                    progress = ReplacePlanner.RestoreJournalProgress(
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            currentPhase = ReplacePlanner.RestorePhase.APPLYING
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.APPLYING,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
                    progress = ReplacePlanner.RestoreJournalProgress(
                        step = "categories",
                        batchIndex = 0,
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            // 1. Categories, chunked by the rules' per-batch document-access budget (AUD-001).
            // The lease renewal in the same batch costs no document access.
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val categoryChunks = RestoreBatches.chunkByBudgetCheck(plan.categoriesToUpsert, 400) {
                it.transactionType != "expense"
            }
            var categoryBatchIndex = 0
            for (chunk in categoryChunks) {
                val batch = firestore.batch()
                for (c in chunk) {
                    val ref = catDoc(expectedUid, c.id)
                    val payload = buildMap<String, Any> {
                        put("name", c.name.trim().take(80))
                        put("iconName", c.iconName.take(63))
                        put("colorInt", c.colorInt.toLong())
                        put("transactionType", c.transactionType)
                        put("sortOrder", c.sortOrder)
                        put("updatedAt", BackupFormat.restoredCategoryRevision(c.updatedAt))
                        put("id", c.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "categories",
                    ),
                )
                batch.commit().await()
                categoryBatchIndex++
                if (faultHooks?.failAfterCategoryBatch == categoryBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_CATEGORY_BATCH")
                }
            }

            // 2. Expenses upsert in chunks of 400
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val expenseUpsertChunks = RestoreBatches.chunkByCategory(plan.expensesToUpsert, 400) { it.categoryId }
            var expenseUpsertBatchIndex = 0
            for (chunk in expenseUpsertChunks) {
                val batch = firestore.batch()
                for (e in chunk) {
                    val ref = expDoc(expectedUid, e.id)
                    val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
                    val payload = buildMap<String, Any> {
                        put("amount", roundedAmount)
                        put("dateMillis", e.dateMillis)
                        put("categoryId", e.categoryId)
                        put("note", e.note.take(2000))
                        put("transactionType", e.transactionType)
                        // A restore is a new write, not a replay of the backup's clock: the
                        // rules deny an updatedAt older than the stored row, so writing the
                        // backup's value failed every replace over an expense edited since.
                        put("updatedAt", System.currentTimeMillis())
                        put("id", e.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "expenses_upsert",
                    ),
                )
                batch.commit().await()
                expenseUpsertBatchIndex++
                if (faultHooks?.failAfterExpenseUpsertBatch == expenseUpsertBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_EXPENSE_UPSERT_BATCH")
                }
            }

            // 3. Stale expenses delete in chunks of 400
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val expenseDeleteChunks = plan.expenseIdsToDelete.chunked(400)
            var expenseDeleteBatchIndex = 0
            for (chunk in expenseDeleteChunks) {
                val batch = firestore.batch()
                for (id in chunk) {
                    batch.delete(expDoc(expectedUid, id))
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "expenses_delete",
                    ),
                )
                batch.commit().await()
                expenseDeleteBatchIndex++
                if (faultHooks?.failAfterExpenseDeleteBatch == expenseDeleteBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_EXPENSE_DELETE_BATCH")
                }
            }

            // 4. Preferences update
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            if (faultHooks?.failBeforePreferences == true) {
                throw IllegalStateException("FAULT_INJECTED_BEFORE_PREFERENCES")
            }
            if (backup.schemaVersion >= 2) applyBudgetCollection(expectedUid, backup.categoryBudgets, true)
            if (backup.schemaVersion == 3 && backup.recurring != null) {
                applyRecurringCollection(expectedUid, backup.recurring, true)
            }
            val p = plan.preferencesToUpdate
            val prefPayload = buildMap<String, Any?> {
                put("currency", p.currency)
                put("locale", p.locale)
                put("themeMode", p.themeMode)
                put("onboardingComplete", p.onboardingComplete)
                put("dailyReminder", p.dailyReminder)
                put("reminderHour", p.reminderHour)
                put("reminderMinute", p.reminderMinute)
                put("analyticsPeriod", p.analyticsPeriod)
                put("monthlyBudget", p.monthlyBudget?.let(CurrencyUtils::roundAmount))
                put("updatedAt", p.updatedAt)
            }
            settingsPrefsDoc(expectedUid).set(prefPayload, SetOptions.merge()).await()
            preferenceManager.applySyncedPreferences(p)

            // 5. Verification
            currentPhase = ReplacePlanner.RestorePhase.VERIFYING
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.VERIFYING,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
                    progress = ReplacePlanner.RestoreJournalProgress(
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            if (faultHooks?.failDuringVerification == true) {
                throw IllegalStateException("FAULT_INJECTED_DURING_VERIFICATION")
            }

            // Verify categories exist
            for (c in plan.categoriesToUpsert) {
                val catDocSnap = catDoc(expectedUid, c.id).get(Source.SERVER).await()
                if (!catDocSnap.exists()) {
                    throw IllegalStateException("REPLACE_VERIFICATION_FAILED: category ${c.id} missing")
                }
            }

            if (plan.expenseIdsToDelete.isNotEmpty()) {
                val sampleId = plan.expenseIdsToDelete.first()
                val checkDoc = expDoc(expectedUid, sampleId).get(Source.SERVER).await()
                if (checkDoc.exists()) {
                    throw IllegalStateException("REPLACE_VERIFICATION_FAILED: deleted expense still exists")
                }
            }

            for (e in plan.expensesToUpsert.take(5)) {
                val checkDoc = expDoc(expectedUid, e.id).get(Source.SERVER).await()
                if (!checkDoc.exists()) {
                    throw IllegalStateException("REPLACE_VERIFICATION_FAILED: restored expense ${e.id} missing")
                }
            }

            val verifyPref = settingsPrefsDoc(expectedUid).get(Source.SERVER).await()
            if (!verifyPref.exists()) {
                throw IllegalStateException("REPLACE_VERIFICATION_FAILED: preferences missing")
            }

            // 6. Completed
            currentPhase = ReplacePlanner.RestorePhase.COMPLETED
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.COMPLETED,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
                    // Terminal writes keep the lease progress: the rules fence terminal
                    // transitions while a lease is active, and a stripped progress map
                    // would both fail the fence and reopen the zombie-completion hole.
                    progress = ReplacePlanner.RestoreJournalProgress(
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            ReplacePlanner.ReplaceResult(
                success = true,
                operationId = operationId,
                plan = plan,
                phase = ReplacePlanner.RestorePhase.COMPLETED,
            )
        } catch (e: Throwable) {
            val errorMsg = e.message ?: e.toString()
            // Once a snapshot exists (created this run, or carried over by a resume) a
            // failure still in PREPARING must be journaled too, or the operation sits in
            // PREPARING behind this dead holder's lease and the next resume is refused.
            if (currentPhase != ReplacePlanner.RestorePhase.PREPARING || snapshotMeta != null) {
                try {
                    setRestoreOperation(
                        expectedUid,
                        ReplacePlanner.RestoreOperationDoc(
                            operationId = operationId,
                            ownerUid = expectedUid,
                            mode = "replace",
                            backupFingerprint = ReplacePlanner.computeBackupFingerprint(backup),
                            phase = ReplacePlanner.RestorePhase.FAILED_RECOVERABLE,
                            createdAt = initialCreatedAt,
                            updatedAt = System.currentTimeMillis(),
                            snapshotMeta = snapshotMeta,
                            error = errorMsg.take(500),
                            failedFromPhase = currentPhase,
                            initiatorPlatform = "android",
                            // Release the lease (as web does): every call mints a new
                            // holder id, so a live expiry here made the user's own
                            // immediate resume or rollback fail as a concurrent client.
                            progress = ReplacePlanner.RestoreJournalProgress(
                                leaseHolder = currentClientId,
                                leaseExpiresAt = 0L,
                                fencingToken = fencingToken,
                            ),
                        ),
                    )
                } catch (_: Exception) {}
            }
            throw e
        } finally {
            activeReplaceOperations.remove(expectedUid)
        }
    }

    suspend fun resumeReplace(
        operation: ReplacePlanner.RestoreOperationDoc,
        backup: BackupFormat.ParsedBackup,
        expectedUid: String,
        faultHooks: ReplacePlanner.ReplaceFaultHooks? = null,
    ): Result<ReplacePlanner.ReplaceResult> {
        if (operation.ownerUid != expectedUid) {
            return Result.failure(IllegalStateException("AUTH_ACCOUNT_CHANGED"))
        }
        val currentFp = ReplacePlanner.computeBackupFingerprint(backup)
        val legacyFp = ReplacePlanner.computeLegacyBackupFingerprint(backup)
        if (currentFp != operation.backupFingerprint && legacyFp != operation.backupFingerprint) {
            return Result.failure(IllegalStateException("FINGERPRINT_MISMATCH: Selected backup does not match the unfinished operation"))
        }
        return executeReplace(backup, expectedUid, faultHooks, isResume = true)
    }

    suspend fun rollbackReplace(
        operation: ReplacePlanner.RestoreOperationDoc,
        expectedUid: String,
        faultHooks: ReplacePlanner.ReplaceFaultHooks? = null,
    ): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        if (u != expectedUid || operation.ownerUid != expectedUid) {
            throw IllegalStateException("AUTH_ACCOUNT_CHANGED")
        }
        requireVerifiedEmail()

        val snapshot = readSafetySnapshot(expectedUid)
        check(snapshot.operationId == operation.operationId) { "SNAPSHOT_OPERATION_MISMATCH" }

        val currentClientId = "android_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"
        if (!activeReplaceOperations.add(expectedUid)) {
            throw IllegalStateException("RESTORE_OPERATION_ALREADY_IN_PROGRESS")
        }
        // Lease acquisition must happen INSIDE the try: if it throws while the uid
        // is already registered above, the finally below still releases the slot —
        // otherwise a failed acquire leaks the uid and blocks every later restore
        // until app restart. acquiredToken stays nullable so the catch can tell
        // whether a lease was ever acquired (web acquires before registering instead).
        var acquiredToken: Long? = null

        try {
            val lease = acquireRecoveryLease(expectedUid, currentClientId, true)
            val fencingToken = lease.fencingToken
            acquiredToken = fencingToken
            setRestoreOperation(
                expectedUid,
                operation.copy(
                    phase = ReplacePlanner.RestorePhase.ROLLING_BACK,
                    updatedAt = System.currentTimeMillis(),
                    progress = ReplacePlanner.RestoreJournalProgress(
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            if (faultHooks?.failDuringRollback == true) {
                throw IllegalStateException("FAULT_INJECTED_DURING_ROLLBACK")
            }

            // 1. Categories — budgeted exactly like the apply step: a rollback that cannot
            // commit its category batch leaves the account half-replaced (AUD-001).
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            for (chunk in RestoreBatches.chunkByBudgetCheck(snapshot.categories, 400) {
                it.transactionType != "expense"
            }) {
                val batch = firestore.batch()
                for (c in chunk) {
                    val ref = catDoc(expectedUid, c.id)
                    val payload = buildMap<String, Any> {
                        put("name", c.name.trim().take(80))
                        put("iconName", c.iconName.take(63))
                        put("colorInt", c.colorInt.toLong())
                        put("transactionType", c.transactionType)
                        put("sortOrder", c.sortOrder)
                        put("updatedAt", System.currentTimeMillis())
                        put("id", c.id)
                    }
                    // Merge so legacy fields a failed replace never touched (deletionState,
                    // recurringTemplateCount, migration markers) survive the round trip.
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "rollback_categories",
                    ),
                )
                batch.commit().await()
            }

            // 1a. Restore recurring collections BEFORE deleting extra categories: a
            // failed replace may have created categories with recurring templates
            // attached, and the rules refuse to stage or delete a category whose
            // recurringTemplateCount is non-zero. replace=true first deletes the
            // extra templates (decrementing those counters), which unblocks 1b.
            // Snapshot templates reference snapshot categories, restored in step 1.
            if (snapshot.recurringTemplates != null) {
                applyRecurringCollection(
                    expectedUid,
                    RecurringBackupSection(
                        templates = snapshot.recurringTemplates,
                        receipts = snapshot.recurringReceipts ?: emptyList(),
                    ),
                    replace = true,
                )
            }

            // 1b. Delete extra categories introduced by failed replacement
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val currentCatSnap = catCol(expectedUid).get(Source.SERVER).await()
            val snapshotCategoryIds = snapshot.categories.map { it.id }.toSet()
            val extraCategories = currentCatSnap.documents.filter { it.id !in snapshotCategoryIds }
            for (extraCat in extraCategories) {
                // No best-effort swallowing here: a silent failure would let the journal
                // reach ROLLED_BACK with leftover categories. Any failure propagates to the
                // outer catch and stays FAILED_RECOVERABLE so a retry finishes the cleanup
                // (web rollbackReplace already behaves this way).
                extraCat.reference.set(
                    mapOf("deletionState" to "deleting", "updatedAt" to System.currentTimeMillis()),
                    SetOptions.merge(),
                ).await()
                val batch = firestore.batch()
                batch.delete(budgetCol(expectedUid).document(extraCat.id))
                batch.delete(extraCat.reference)
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "rollback_extra_categories",
                    ),
                )
                batch.commit().await()
            }

            // 2. Expenses upsert
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val snapshotExpenseIds = snapshot.expenses.map { it.id }.toSet()
            for (chunk in RestoreBatches.chunkByCategory(snapshot.expenses, 400) { it.categoryId }) {
                val batch = firestore.batch()
                for (e in chunk) {
                    val ref = expDoc(expectedUid, e.id)
                    val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
                    val payload = buildMap<String, Any> {
                        put("amount", roundedAmount)
                        put("dateMillis", e.dateMillis)
                        put("categoryId", e.categoryId)
                        put("note", e.note.take(2000))
                        put("transactionType", e.transactionType)
                        put("deleted", e.deleted)
                        put("updatedAt", System.currentTimeMillis())
                        put("id", e.id)
                        // A row the failed replace deleted comes back from the snapshot
                        // alone, so its legacy fields must come from there too.
                        putAll(snapshot.expenseLegacyFields[e.id].orEmpty())
                    }
                    // Merge so legacy fields (cloudId, categoryCloudId, receiptImagePath)
                    // still present on the doc are not erased by the rollback write.
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "rollback_expenses",
                    ),
                )
                batch.commit().await()
            }

            // 3. Delete expenses not in snapshot
            verifyAndRenewRecoveryLease(expectedUid, currentClientId, fencingToken)
            val currentExpSnap = expCol(expectedUid).get(Source.SERVER).await()
            val extraExpenseIds = currentExpSnap.documents
                .filter { it.id !in snapshotExpenseIds }
                .map { it.id }

            for (chunk in extraExpenseIds.chunked(400)) {
                val batch = firestore.batch()
                for (id in chunk) {
                    batch.delete(expDoc(expectedUid, id))
                }
                batch.update(
                    restoreOpDoc(expectedUid),
                    mapOf(
                        "updatedAt" to System.currentTimeMillis(),
                        "progress.fencingToken" to fencingToken,
                        "progress.leaseHolder" to currentClientId,
                        "progress.leaseExpiresAt" to (System.currentTimeMillis() + 60_000L),
                        "progress.lastBatchCommittedAt" to System.currentTimeMillis(),
                        "progress.step" to "rollback_extra_expenses",
                    ),
                )
                batch.commit().await()
            }

            snapshot.categoryBudgets?.let { applyBudgetCollection(expectedUid, it, true) }

            // 4. Restore preferences
            snapshot.preferences?.let { p ->
                val newTimestamp = Math.max(System.currentTimeMillis(), p.updatedAt + 1L)
                val restored = p.copy(updatedAt = newTimestamp)
                val prefPayload = buildMap<String, Any?> {
                    put("currency", restored.currency)
                    put("locale", restored.locale)
                    put("themeMode", restored.themeMode)
                    put("onboardingComplete", restored.onboardingComplete)
                    put("dailyReminder", restored.dailyReminder)
                    put("reminderHour", restored.reminderHour)
                    put("reminderMinute", restored.reminderMinute)
                    put("analyticsPeriod", restored.analyticsPeriod)
                    // Rules reject a changed sub-cent budget, so a legacy one is rounded on rollback.
                    put("monthlyBudget", restored.monthlyBudget?.let(CurrencyUtils::roundAmount))
                    put("updatedAt", restored.updatedAt)
                }
                settingsPrefsDoc(expectedUid).set(prefPayload).await()
                preferenceManager.applySyncedPreferences(restored)
            }

            // 5. Update journal to ROLLED_BACK
            setRestoreOperation(
                expectedUid,
                operation.copy(
                    phase = ReplacePlanner.RestorePhase.ROLLED_BACK,
                    updatedAt = System.currentTimeMillis(),
                    // Keep the lease progress on the terminal write: the rules fence
                    // terminal transitions while a lease is active (see executeReplace).
                    progress = ReplacePlanner.RestoreJournalProgress(
                        leaseHolder = currentClientId,
                        leaseExpiresAt = System.currentTimeMillis() + 60_000L,
                        fencingToken = fencingToken,
                    ),
                ),
            )

            // 6. Delete snapshot
            deleteSafetySnapshot(expectedUid)
        } catch (e: Throwable) {
            val errorMsg = e.message ?: e.toString()
            try {
                setRestoreOperation(
                    expectedUid,
                    operation.copy(
                        phase = ReplacePlanner.RestorePhase.FAILED_RECOVERABLE,
                        updatedAt = System.currentTimeMillis(),
                        error = "Rollback failed: $errorMsg".take(500),
                        failedFromPhase = ReplacePlanner.RestorePhase.ROLLING_BACK,
                        // No lease progress without an acquired lease: a null-token
                        // progress map would fail the rules fence anyway.
                        // Expiry 0 releases the lease so the user can retry right away.
                        progress = acquiredToken?.let { token ->
                            ReplacePlanner.RestoreJournalProgress(
                                leaseHolder = currentClientId,
                                leaseExpiresAt = 0L,
                                fencingToken = token,
                            )
                        },
                    ),
                )
            } catch (_: Exception) {}
            throw e
        } finally {
            activeReplaceOperations.remove(expectedUid)
        }
    }

    suspend fun dismissCompletedOperation(expectedUid: String): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        if (u != expectedUid) {
            throw IllegalStateException("AUTH_ACCOUNT_CHANGED")
        }
        requireVerifiedEmail()
        restoreOpDoc(expectedUid).delete().await()
        deleteSafetySnapshot(expectedUid)
    }
}
