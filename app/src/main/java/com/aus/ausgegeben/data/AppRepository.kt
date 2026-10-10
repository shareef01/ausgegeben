package com.aus.ausgegeben.data

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import android.util.Log
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.FirestoreClient
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.util.AnalyticsPeriod
import com.aus.ausgegeben.util.BackupFormat
import com.aus.ausgegeben.util.CategoryDedupe
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.RestoreUtils
import com.aus.ausgegeben.util.ReplacePlanner
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.expenseDocumentId
import com.aus.ausgegeben.util.runSuspendCatching
import kotlin.math.roundToLong
import com.google.firebase.firestore.AggregateField
import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import java.util.UUID
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import com.aus.ausgegeben.util.RecurringBackupSection
import com.aus.ausgegeben.util.OccurrenceReceipt
import com.aus.ausgegeben.data.entity.RecurringTemplate
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppRepository @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val authRepository: AuthRepository,
    private val preferenceManager: PreferenceManager,
    private val firestoreClient: FirestoreClient,
    private val recurringRepository: RecurringRepository,
) : CategoryActions, ExpenseActions, AccountActions {
    constructor(
        appContext: Context,
        authRepository: AuthRepository,
        preferenceManager: PreferenceManager,
        firestoreClient: FirestoreClient,
    ) : this(appContext, authRepository, preferenceManager, firestoreClient, RecurringRepository(firestoreClient, authRepository))
    private val firestore get() = firestoreClient.get()
    companion object {
        const val UNCATEGORIZED_ID = "0"
        private const val TAG = "AppRepository"
        /** Soft cap matching web getAllExpensesCapped — unbounded listeners burn quota. */
        const val ALL_EXPENSES_SOFT_CAP = 5_000L
        private const val CATEGORY_MIGRATION_STATE = "migrating"
        private const val ORPHAN_PAGE_SIZE = 450L
        private const val ORPHAN_PAGES_PER_RUN = 10

        /**
         * Which generation of the orphan sweep has run for an account.
         *
         * Bump when the sweep's behaviour changes and every existing account should run
         * the new one once. Gating on the *presence* of `orphansScannedAt` — which this
         * replaces — has already made a shipped repair permanently unrunnable: the marker
         * was set on every account that had cold-started, so the fix could never fire on
         * the long-lived accounts it was written for. Must stay identical to web's
         * ORPHAN_SCAN_VERSION in expenseRepository.ts.
         */
        const val ORPHAN_SCAN_VERSION = 1L

        /**
         * True when this account has not yet run the current generation of the sweep.
         * A marker with no version predates versioning, so the current sweep has not run.
         */
        internal fun needsOrphanScan(scanVersion: Long?): Boolean =
            scanVersion == null || scanVersion < ORPHAN_SCAN_VERSION
        private const val ALL_EXPENSES_CAP = ALL_EXPENSES_SOFT_CAP
        private const val LISTENER_ERROR = "LISTENER_ERROR"
    }

    // Guards ensureSeeded() so two concurrent callers (e.g. AuthViewModel right after
    // sign-in and MainActivity's post-auth-gateway LaunchedEffect) can't both observe an
    // empty categories collection and both batch-insert the default set.
    private val ensureSeededMutex = Mutex()

    // In-process lock per UID to prevent concurrent replace runs on same device
    private val activeReplaceOperations = ConcurrentHashMap.newKeySet<String>()

    /** Which realtime listeners are currently broken. See [markListenerFailed]. */
    private enum class ListenerSource { CATEGORIES, EXPENSES_IN_RANGE, ALL_EXPENSES, RECORD_EXPENSES }

    private val failedListeners = ConcurrentHashMap.newKeySet<ListenerSource>()

    private val _listenerError = MutableStateFlow<String?>(null)
    /**
     * Non-null while at least one Firestore realtime listener is broken, so callers can tell
     * "genuinely empty" apart from "listener broke". Surfaced as an in-tab error empty state
     * on Record / Insights.
     *
     * Tracked per source because a single shared flag cross-contaminated: any listener's
     * successful snapshot cleared an error raised by a *different* listener, so a genuinely
     * broken expense query stopped surfacing as soon as the categories listener ticked.
     */
    val listenerError: StateFlow<String?> = _listenerError.asStateFlow()

    private fun markListenerFailed(source: ListenerSource) {
        failedListeners.add(source)
        _listenerError.value = LISTENER_ERROR
    }

    private fun markListenerHealthy(source: ListenerSource) {
        failedListeners.remove(source)
        _listenerError.value = if (failedListeners.isEmpty()) null else LISTENER_ERROR
    }

    private val truncatedListeners = ConcurrentHashMap.newKeySet<ListenerSource>()

    private val _dataTruncated = MutableStateFlow(false)
    /**
     * True while a capped listener actually hit the row cap.
     *
     * Consumers used to re-derive this as `emittedSize >= ALL_EXPENSES_SOFT_CAP`, which cannot
     * work: the listener queries CAP + 1 rows and trims the emission to CAP, so a genuinely
     * complete result of exactly CAP rows was indistinguishable from a truncated one and
     * raised a false "showing latest N only" banner. Only the listener sees the untrimmed
     * count, so only the listener can report this.
     */
    override val dataTruncated: StateFlow<Boolean> = _dataTruncated.asStateFlow()

    private fun markTruncation(source: ListenerSource, truncated: Boolean) {
        if (truncated) truncatedListeners.add(source) else truncatedListeners.remove(source)
        _dataTruncated.value = truncatedListeners.isNotEmpty()
    }

    /** Bumped by [retryListeners] so snapshot flows tear down and re-subscribe. */
    private val _listenerEpoch = MutableStateFlow(0)

    /** Clears surfaced listener failures and forces expense listeners to re-attach. */
    fun retryListeners() {
        failedListeners.clear()
        _listenerError.value = null
        _listenerEpoch.update { it + 1 }
    }

    private fun uid(): String? = authRepository.currentUserId

    private fun requireVerifiedEmail() {
        val user = authRepository.currentUser ?: throw IllegalStateException("Not signed in")
        if (!user.isEmailVerified) {
            throw IllegalStateException("EMAIL_NOT_VERIFIED")
        }
    }
    /** Restarts the given listener flow whenever the signed-in user or retry epoch changes. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun <T> perUserFlow(signedOutValue: T, build: (String) -> Flow<T>): Flow<T> =
        combine(
            authRepository.authState.map { it?.uid }.distinctUntilChanged(),
            _listenerEpoch,
        ) { u, _ -> u }
            .flatMapLatest { u -> if (u == null) flowOf(signedOutValue) else build(u) }

    private fun userCol(uid: String, name: String) = firestore.collection("users").document(uid).collection(name)
    private fun catCol(uid: String) = userCol(uid, FirestorePaths.CATEGORIES_COLLECTION)
    private fun expCol(uid: String) = userCol(uid, FirestorePaths.EXPENSES_COLLECTION)
    private fun metaCol(uid: String) = userCol(uid, FirestorePaths.META_COLLECTION)
    private fun settingsPrefsDoc(uid: String) =
        userCol(uid, FirestorePaths.SETTINGS_COLLECTION).document(FirestorePaths.PREFERENCES_DOC)
    private fun catDoc(uid: String, id: String) = catCol(uid).document(id)
    private fun expDoc(uid: String, id: String) = expCol(uid).document(id)
    private fun dedupeMarkerDoc(uid: String) = metaCol(uid).document(FirestorePaths.DEDUPE_DOC)
    private fun accountDeletionDoc(uid: String) = metaCol(uid).document(FirestorePaths.ACCOUNT_DELETION_DOC)
    private fun restoreOpDoc(uid: String) = metaCol(uid).document(FirestorePaths.RESTORE_OPERATION_DOC)
    private fun snapshotCol(uid: String) = userCol(uid, FirestorePaths.RESTORE_SNAPSHOT_COLLECTION)
    private fun snapshotDoc(uid: String, id: String) = snapshotCol(uid).document(id)

    /** True when wipe finished but Auth delete failed — blocks re-seeding empty accounts. */
    override suspend fun isAccountDeletionPending(): Boolean {
        val u = uid() ?: return false
        return accountDeletionDoc(u).get().await().getBoolean("pendingDeletion") == true
    }

    /** Firestore rules accept this only with an ID token authenticated in the last five minutes. */
    override suspend fun markAccountDeletionPending(): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        accountDeletionDoc(u).set(
            mapOf(
                "pendingDeletion" to true,
                "state" to "deleting",
                "startedAt" to System.currentTimeMillis(),
            ),
        ).await()
    }

    /**
     * Same two steps [AuthRepository.signOut] performs, callable on the deletion path.
     * A failure is returned separately from cloud/Auth deletion so the UI can truthfully
     * report that the account is gone while local financial cache removal is unconfirmed.
     */
    override suspend fun clearAccountLocalState(): Result<Unit> = runSuspendCatching {
        preferenceManager.clearAccountLocalState()
        firestoreClient.clearOfflineCache()
    }

    suspend fun ensureSeeded() {
        ensureSeededMutex.withLock {
            requireVerifiedEmail()
            val u = uid() ?: return
            // Seeding stays blocked while the marker is set: re-seeding here would dress a
            // half-deleted account up as a working fresh one. The account is therefore
            // unusable — no categories, so nothing can be recorded — until the user either
            // retries deletion successfully.
            if (isAccountDeletionPending()) {
                Log.w(TAG, "ensureSeeded skipped: account deletion incomplete")
                return
            }
            // A process may have died between a submission's Firestore write landing and
            // its journal entry being cleared. Reconcile rather than resubmit: this never
            // attempts a write, so it can only ever forget bookkeeping for an operation
            // that already succeeded, never collide with a later, unrelated submission.
            // See DATA-1.
            runSuspendCatching {
                preferenceManager.reconcilePendingExpenseSubmissions { operationId ->
                    expDoc(u, expenseDocumentId(operationId)).get(Source.SERVER).await().exists()
                }
            }.onFailure { e -> Log.w(TAG, "pending submission reconciliation failed", e) }
            val marker = dedupeMarkerDoc(u).get().await()
            var snap = catCol(u).get().await()
            if (!snap.isEmpty) {
                // A process may have died after staging a category type or after any
                // expense batch. Resume before dedupe/repair observes mixed types.
                resumeCategoryTypeMigrations(u, snap.documents)
                snap = catCol(u).get().await()
            }
            val strings = localizedContext()
            // Dedupe and the orphan sweep are both full-collection reads — by far the most
            // expensive thing this app does. Each runs at most once per account rather than
            // on every cold start / sign-in, and the sweep is skipped when dedupe just ran it.
            var sweptNow = false
            if (snap.isEmpty) {
                val defaults = listOf(
                    Category(name = strings.getString(R.string.cat_groceries), iconName = "shopping_cart", colorInt = 0xffe86b5a.toInt(), transactionType = "expense", sortOrder = 0),
                    Category(name = strings.getString(R.string.cat_shopping), iconName = "shopping_bag", colorInt = 0xffe8a060.toInt(), transactionType = "expense", sortOrder = 1),
                    Category(name = strings.getString(R.string.cat_dining), iconName = "restaurant", colorInt = 0xffd4849a.toInt(), transactionType = "expense", sortOrder = 2),
                    Category(name = strings.getString(R.string.cat_transport), iconName = "car", colorInt = 0xff6a9fd4.toInt(), transactionType = "expense", sortOrder = 3),
                    Category(name = strings.getString(R.string.cat_bills), iconName = "bolt", colorInt = 0xff9a8fd4.toInt(), transactionType = "expense", sortOrder = 4),
                    Category(name = strings.getString(R.string.cat_subscriptions), iconName = "subscriptions", colorInt = 0xff5ab8aa.toInt(), transactionType = "expense", sortOrder = 5),
                    Category(name = strings.getString(R.string.cat_salary), iconName = "credit_card", colorInt = 0xff5cb88a.toInt(), transactionType = "income", sortOrder = 0),
                    Category(name = strings.getString(R.string.cat_freelance), iconName = "work", colorInt = 0xff6a9fd4.toInt(), transactionType = "income", sortOrder = 1),
                    Category(name = strings.getString(R.string.cat_refunds), iconName = "undo", colorInt = 0xffb8a060.toInt(), transactionType = "income", sortOrder = 2),
                    Category(name = strings.getString(R.string.cat_transfer), iconName = "swap_horiz", colorInt = 0xff8e8e96.toInt(), transactionType = "transfer", sortOrder = 0),
                )
                firestore.runBatch { batch ->
                    defaults.forEach { c ->
                        batch.set(catDoc(u, c.id), categoryPayload(c))
                    }
                }.await()
            } else if (marker.getBoolean("categoriesDeduped") != true) {
                // Manual calls to deduplicateCategories() (the confirmed
                // "Deduplicate categories" action in the manage-categories sheet)
                // bypass this marker entirely since they call the function
                // directly, not through ensureSeeded().
                val dedupeResult = deduplicateCategories()
                if (dedupeResult.isSuccess) {
                    sweptNow = true
                    dedupeMarkerDoc(u).set(
                        mapOf("categoriesDeduped" to true, "ranAt" to System.currentTimeMillis()),
                        SetOptions.merge()
                    ).await()
                } else {
                    Log.w(TAG, "dedupe skipped marker", dedupeResult.exceptionOrNull())
                }
            }
            if (!sweptNow && needsOrphanScan(marker.getLong("orphanScanVersion"))) {
                runSuspendCatching { sweepOrphanedExpenses(u) }
                    .onFailure { e -> Log.w(TAG, "orphan repair failed", e) }
            }
            // Remove legacy Uncategorized (id "0") so intentional deletes stick — but
            // only once nothing points at it. deleteCategory reassigns linked expenses to
            // this sink, and firestore.rules requires the target category to exist on
            // every expense update, so clearing it while still referenced left those rows
            // permanently uneditable (generic "save failed", no way to recover in-app).
            runSuspendCatching {
                if (catDoc(u, UNCATEGORIZED_ID).get().await().exists() &&
                    expenseDocsForCategory(u, UNCATEGORIZED_ID).isEmpty()
                ) {
                    deleteCategoryInto(u, UNCATEGORIZED_ID, null)
                }
            }
        }
    }

    override suspend fun deduplicateCategories(): Result<Unit> = runSuspendCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        
        // SECURE: Fetch ALL categories directly (no orderBy) to catch docs missing sortOrder
        val allSnap = catCol(u).get().await()
        val categories = allSnap.documents.mapNotNull { categoryFromDoc(it) }
            .filter { it.id != UNCATEGORIZED_ID }
        
        val groups = categories.groupBy { it.name.lowercase(Locale.ROOT).trim() to it.transactionType }
        
        groups.filter { it.value.size > 1 }.forEach { (_, group) ->
            val master = CategoryDedupe.pickMaster(group)
            val duplicates = group.filter { it.id != master.id }

            duplicates.forEach { dup ->
                deleteCategoryInto(u, dup.id, master.id)
            }
        }
        
        // Repair missing sortOrder fields on remaining categories
        val remaining = catCol(u).get().await()
        remaining.documents.forEachIndexed { index, doc ->
            if (!doc.contains("sortOrder")) {
                doc.reference.update("sortOrder", index).await()
            }
        }

        // Dedupe's own TOCTOU window can orphan an expense, and this is the user's
        // "repair my categories" action — so sweep here rather than on every launch.
        sweepOrphanedExpenses(u)
    }

    /**
     * Repair bounded document-ID-ordered pages, durably advancing after each page.
     * Transient/quota failures retain the last cursor and never publish the terminal
     * version, so later launches resume instead of permanently skipping old rows.
     * [deleteCategory] and [deduplicateCategories] already reassign their own expenses
     * before dropping a category, which leaves this sweep to catch only rows stranded
     * by an interrupted delete — a one-time pass, plus the manual "Deduplicate
     * categories" action, covers that.
     */
    private suspend fun sweepOrphanedExpenses(u: String) {
        val markerRef = dedupeMarkerDoc(u)
        val initial = markerRef.get().await()
        var cursor = if (initial.getLong("orphanRepairTargetVersion") == ORPHAN_SCAN_VERSION) {
            initial.getString("orphanRepairCursorId")
        } else null

        repeat(ORPHAN_PAGES_PER_RUN) {
            val expectedCursor = cursor
            val result = repairOrphanPage(u, cursor)
            val advanced = firestore.runTransaction { transaction ->
                val latest = transaction.get(markerRef)
                val sameGeneration = latest.getLong("orphanRepairTargetVersion") == ORPHAN_SCAN_VERSION
                val latestCursor = if (sameGeneration) latest.getString("orphanRepairCursorId") else null
                if (latestCursor != expectedCursor) return@runTransaction false
                val priorUnfixable = if (sameGeneration) {
                    latest.getLong("orphanRepairUnfixable") ?: 0L
                } else 0L
                val totalUnfixable = priorUnfixable + result.unfixable
                val update = if (result.complete) {
                    mapOf(
                        "orphansScannedAt" to System.currentTimeMillis(),
                        "orphanScanVersion" to ORPHAN_SCAN_VERSION,
                        "orphanRepairState" to if (totalUnfixable > 0) "complete_with_errors" else "complete",
                        "orphanRepairUnfixable" to totalUnfixable,
                        "orphanRepairUpdatedAt" to System.currentTimeMillis(),
                        "orphanRepairCursorId" to FieldValue.delete(),
                        "orphanRepairTargetVersion" to FieldValue.delete(),
                        "orphanRepairScanTruncated" to FieldValue.delete(),
                    )
                } else {
                    mapOf(
                        "orphanRepairState" to "running",
                        "orphanRepairCursorId" to requireNotNull(result.nextCursor),
                        "orphanRepairTargetVersion" to ORPHAN_SCAN_VERSION,
                        "orphanRepairUnfixable" to totalUnfixable,
                        "orphanRepairUpdatedAt" to System.currentTimeMillis(),
                        "orphanRepairScanTruncated" to FieldValue.delete(),
                    )
                }
                transaction.set(markerRef, update, SetOptions.merge())
                true
            }.await()
            if (!advanced || result.complete) return
            cursor = result.nextCursor
        }
    }

    // ── Categories ──

    override val allCategories: Flow<List<Category>> = perUserFlow(emptyList()) { u ->
        callbackFlow {
            val sub = catCol(u).orderBy("sortOrder").addSnapshotListener { snap, error ->
                if (error != null) {
                    Log.w(TAG, "categories listener error", error)
                    markListenerFailed(ListenerSource.CATEGORIES)
                }
                if (snap != null) {
                    markListenerHealthy(ListenerSource.CATEGORIES)
                    trySend(snap.documents.mapNotNull { doc -> categoryFromDoc(doc) })
                }
            }
            // Detached listeners must not keep the banner up for a query nobody is running.
            awaitClose {
                sub.remove()
                markListenerHealthy(ListenerSource.CATEGORIES)
            }
        }
    }

    override suspend fun insertCategory(category: Category): Result<String> = runSuspendCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val sanitized = com.aus.ausgegeben.util.CategoryValidator.sanitize(category.name)
        if (!com.aus.ausgegeben.util.CategoryValidator.isValid(sanitized)) {
            throw IllegalArgumentException("Invalid category name")
        }
        val id = UUID.randomUUID().toString()
        val c = category.copy(
            id = id,
            name = sanitized
        )
        catDoc(u, id).set(categoryPayload(c)).await()
        id
    }

    override suspend fun updateCategory(category: Category): Result<Unit> = runSuspendCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val sanitized = com.aus.ausgegeben.util.CategoryValidator.sanitize(category.name)
        if (!com.aus.ausgegeben.util.CategoryValidator.isValid(sanitized)) {
            throw IllegalArgumentException("Invalid category name")
        }
        val desired = category.copy(name = sanitized)
        val ref = catDoc(u, category.id)
        val snapshot = ref.get().await()
        val persisted = categoryFromDoc(snapshot)
            ?: throw IllegalStateException("CATEGORY_NOT_FOUND")
        check(desired.transactionType == persisted.transactionType || (snapshot.getLong("recurringTemplateCount") ?: 0) == 0L) { "CATEGORY_HAS_RECURRING" }
        val pendingType = persisted.pendingTransactionType
            .takeIf { persisted.migrationState == CATEGORY_MIGRATION_STATE }

        when {
            pendingType != null -> {
                if (desired.transactionType != persisted.transactionType &&
                    desired.transactionType != pendingType
                ) {
                    throw IllegalStateException("CATEGORY_TYPE_MIGRATION_IN_PROGRESS")
                }
                migrateCategoryType(u, desired, persisted.transactionType, pendingType)
            }
            desired.transactionType != persisted.transactionType ->
                migrateCategoryType(u, desired, persisted.transactionType, desired.transactionType)
            else -> ref.set(categoryPayload(desired), SetOptions.merge()).await()
        }
    }

    private suspend fun resumeCategoryTypeMigrations(
        u: String,
        documents: List<DocumentSnapshot>,
    ) {
        documents.mapNotNull(::categoryFromDoc)
            .filter { it.migrationState == CATEGORY_MIGRATION_STATE && it.pendingTransactionType != null }
            .forEach { category ->
                migrateCategoryType(
                    u = u,
                    desired = category,
                    currentType = category.transactionType,
                    targetType = requireNotNull(category.pendingTransactionType),
                )
            }
    }

    /**
     * Stage an old+target category shape accepted by rules, migrate every expense in
     * restartable chunks, then publish the target and remove the marker. A failure at
     * any point leaves enough state for ensureSeeded() or the next edit to resume.
     */
    private suspend fun migrateCategoryType(
        u: String,
        desired: Category,
        currentType: String,
        targetType: String,
    ) {
        require(targetType in setOf("expense", "income", "transfer"))
        require(targetType != currentType)
        val ref = catDoc(u, desired.id)
        val staged = desired.copy(
            transactionType = currentType,
            migrationState = CATEGORY_MIGRATION_STATE,
            pendingTransactionType = targetType,
        )
        // Serialize competing devices. A stale client may join the same migration,
        // but it cannot replace it with a different target or stage from an old type.
        firestore.runTransaction { transaction ->
            val latest = categoryFromDoc(transaction.get(ref))
                ?: throw IllegalStateException("CATEGORY_NOT_FOUND")
            val latestTarget = latest.pendingTransactionType
                .takeIf { latest.migrationState == CATEGORY_MIGRATION_STATE }
            when {
                latestTarget == targetType && latest.transactionType == currentType ->
                    transaction.set(ref, categoryPayload(staged), SetOptions.merge())
                latestTarget != null ->
                    throw IllegalStateException("CATEGORY_TYPE_MIGRATION_IN_PROGRESS")
                latest.transactionType == currentType ->
                    transaction.set(ref, categoryPayload(staged), SetOptions.merge())
                latest.transactionType == targetType -> return@runTransaction false
                else -> throw IllegalStateException("CATEGORY_TYPE_CHANGED")
            }
            true
        }.await().let { stagedOrActive ->
            if (!stagedOrActive) return
        }

        updateExpenseTypesForCategory(desired.id, targetType).getOrThrow()

        val finalized = categoryPayload(
            desired.copy(
                transactionType = targetType,
                migrationState = null,
                pendingTransactionType = null,
            ),
        ).toMutableMap()
        finalized["migrationState"] = FieldValue.delete()
        finalized["pendingTransactionType"] = FieldValue.delete()
        firestore.runTransaction { transaction ->
            val latest = categoryFromDoc(transaction.get(ref))
                ?: throw IllegalStateException("CATEGORY_NOT_FOUND")
            if (latest.migrationState == CATEGORY_MIGRATION_STATE &&
                latest.pendingTransactionType == targetType &&
                latest.transactionType == currentType
            ) {
                if (targetType != "expense") transaction.delete(budgetCol(u).document(desired.id))
                transaction.set(ref, finalized, SetOptions.merge())
            } else if (latest.migrationState != CATEGORY_MIGRATION_STATE &&
                latest.transactionType != targetType
            ) {
                throw IllegalStateException("CATEGORY_TYPE_CHANGED")
            }
        }.await()
    }

    /**
     * Used by moveCategory: a reorder touches every category in a type at once
     * (renumbering sequentially), and writing those one at a time left a window
     * where a failure partway through could leave the type half-renumbered — a
     * worse state than either the old or new order. A batch commits all writes
     * together or none of them.
     */
    override suspend fun updateCategoriesBatch(categories: List<Category>): Result<Unit> = runSuspendCatching {
        if (categories.isEmpty()) return@runSuspendCatching
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val prepared = categories.map { category ->
            val sanitized = com.aus.ausgegeben.util.CategoryValidator.sanitize(category.name)
            category.copy(name = sanitized.ifBlank { category.name.trim().take(80) })
        }
        // The batch is all-or-nothing by design, so screen for rows the rules will refuse
        // before committing. Without this a single legacy category with a blank name or
        // icon failed the whole commit, and every reorder in that type failed forever
        // behind a generic message that named nothing.
        val unwritable = prepared.filterNot { c ->
            com.aus.ausgegeben.util.CategoryValidator.isRulesWritable(
                name = c.name,
                iconName = c.iconName,
                colorInt = c.colorInt,
                transactionType = c.transactionType,
                sortOrder = c.sortOrder,
            )
        }
        if (unwritable.isNotEmpty()) {
            throw UnwritableCategoryException(
                unwritable.joinToString(", ") { it.name.trim().ifBlank { it.id } },
            )
        }
        firestore.runBatch { batch ->
            prepared.forEach { c ->
                batch.set(catDoc(u, c.id), categoryPayload(c), SetOptions.merge())
            }
        }.await()
    }

    override suspend fun deleteCategory(category: Category): Result<Unit> = runSuspendCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        deleteCategoryInto(
            u,
            category.id,
            if (category.id == UNCATEGORIZED_ID) null else UNCATEGORIZED_ID,
        )
    }

    // ── Expenses ──

    private suspend fun applyBudgetCollection(u: String, budgets: List<com.aus.ausgegeben.data.entity.CategoryBudget>, replace: Boolean) {
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        if (replace) {
            val ids = budgets.map { it.categoryId }.toSet()
            for (budget in getCategoryBudgets(u).filter { it.categoryId !in ids }) {
                check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
                commitCategoryBudget(u, budget.categoryId, null, null, checkRevision = false)
            }
        }
        for (budget in budgets) {
            commitCategoryBudget(u, budget.categoryId, budget, null, checkRevision = false)
        }
    }

    private suspend fun applyRecurringCollection(u: String, section: RecurringBackupSection, replace: Boolean) {
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        if (replace) {
            val current = recurringRepository.getAll(u)
            val desired = section.templates.map { it.id }.toSet()
            for (t in current) {
                if (t.id !in desired) {
                    check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
                    recurringRepository.restoreTemplate(u, null, t.id)
                }
            }
        }
        for (t in section.templates) {
            check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
            recurringRepository.restoreTemplate(u, t, t.id)
        }
        recurringRepository.restoreReceipts(u, section.receipts)
    }

    suspend fun getRecurringBackupSection(u: String): RecurringBackupSection {
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        return RecurringBackupSection(
            templates = recurringRepository.getAll(u),
            receipts = recurringRepository.getReceipts(u),
        )
    }

    data class BudgetSnapshot(
        val budgets: List<com.aus.ausgegeben.data.entity.CategoryBudget> = emptyList(),
        val incomplete: Boolean = true,
        val error: Boolean = false,
    )
    private fun budgetCol(u: String) = userCol(u, FirestorePaths.CATEGORY_BUDGETS_COLLECTION)
    private fun budgetFromDoc(d: com.google.firebase.firestore.DocumentSnapshot) = com.aus.ausgegeben.data.entity.CategoryBudget(
        d.id, d.getDouble("monthlyLimit") ?: 0.0,
        (d.getLong("warningThresholdPercent") ?: 80).toInt(), d.getLong("updatedAt") ?: 0,
    )
    suspend fun getCategoryBudgets(u: String): List<com.aus.ausgegeben.data.entity.CategoryBudget> {
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        val snapshot = budgetCol(u).get(Source.SERVER).await()
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        return snapshot.documents.map(::budgetFromDoc)
    }
    override val categoryBudgets: Flow<BudgetSnapshot> = perUserFlow(BudgetSnapshot()) { u ->
        callbackFlow {
            val active = java.util.concurrent.atomic.AtomicBoolean(true)
            val sub = budgetCol(u).addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snap, error ->
                if (active.get() && uid() == u) {
                    trySend(if (snap != null) BudgetSnapshot(snap.documents.map(::budgetFromDoc), snap.metadata.isFromCache)
                        else BudgetSnapshot(error = error != null))
                }
            }
            awaitClose { active.set(false); sub.remove() }
        }
    }
    suspend fun saveCategoryBudget(
        u: String, categoryId: String,
        budget: com.aus.ausgegeben.data.entity.CategoryBudget?, expectedAt: Long?,
    ): Result<Unit> = runSuspendCatching {
        requireVerifiedEmail()
        commitCategoryBudget(u, categoryId, budget, expectedAt, checkRevision = true)
    }

    private suspend fun commitCategoryBudget(
        u: String, categoryId: String,
        budget: com.aus.ausgegeben.data.entity.CategoryBudget?, expectedAt: Long?, checkRevision: Boolean,
    ) {
        check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
        require(budget == null || (budget.valid() && budget.categoryId == categoryId)) { "INVALID_BUDGET" }
        val ref = budgetCol(u).document(categoryId)
        ref.get(Source.SERVER).await() // Never queue offline edits, including restore removals.
        firestore.runTransaction { tx ->
            check(uid() == u) { "AUTH_ACCOUNT_CHANGED" }
            val old = tx.get(ref)
            val revision = old.getLong("updatedAt")
            if (checkRevision) check(revision == expectedAt) { "BUDGET_CONFLICT" }
            if (budget == null) tx.delete(ref)
            else tx.set(ref, budget.copy(updatedAt = maxOf(System.currentTimeMillis(), (revision ?: 0) + 1)).payload())
            Unit
        }.await()
    }

    override fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
        perUserFlow(emptyList()) { u ->
            callbackFlow {
                val q = expCol(u)
                    .whereGreaterThanOrEqualTo("dateMillis", startMillis)
                    .whereLessThan("dateMillis", endMillis)
                    .orderBy("dateMillis", Query.Direction.DESCENDING)
                val sub = q.addSnapshotListener { snap, error ->
                    if (error != null) {
                        Log.w(TAG, "expenses-in-range listener error", error)
                        markListenerFailed(ListenerSource.EXPENSES_IN_RANGE)
                    }
                    if (snap != null) {
                        markListenerHealthy(ListenerSource.EXPENSES_IN_RANGE)
                        trySend(snap.documents.mapNotNull { doc ->
                            expenseFromDoc(doc)?.takeIf { !it.deleted }
                        })
                    }
                }
                awaitClose {
                    sub.remove()
                    markListenerHealthy(ListenerSource.EXPENSES_IN_RANGE)
                }
            }
        }

    /**
     * [idempotencyKey] makes a retried save collapse onto one transaction instead of
     * creating a second. The caller mints it once per compose session and reuses it
     * across retries, matching the web client so both write the same field.
     *
     * AddExpenseViewModel's in-memory `isSaving` flag already blocks a double tap, but
     * it dies with the process: a save interrupted by a crash, a low-memory kill, or
     * an offline write replayed after restart had nothing stopping it from landing
     * twice. The key survives all three because it is stored on the document.
     */
    override suspend fun insertExpense(expense: Expense, idempotencyKey: String?): Result<String> =
        insertExpenseScoped(expense, idempotencyKey, null)

    private suspend fun insertExpenseScoped(expense: Expense, idempotencyKey: String?, expectedUid: String?): Result<String> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        check(expectedUid == null || u == expectedUid) { "AUTH_ACCOUNT_CHANGED" }
        requireVerifiedEmail()
        if (idempotencyKey != null) {
            // Historical releases used random ids. Return an existing legacy row before
            // deriving the modern identity so an upgrade does not duplicate history.
            val existing = try {
                expCol(u)
                    .whereEqualTo("idempotencyKey", idempotencyKey)
                    .limit(1)
                    .get()
                    .await()
            } catch (_: Exception) {
                null
            }
            existing?.documents?.firstOrNull()?.let { return@runSuspendCatching it.id }

            val id = expenseDocumentId(idempotencyKey)
            val e = expense.copy(
                id = id,
                amount = roundAmount(expense.amount),
                note = expense.note.trim().take(2000),
            )
            val ref = expDoc(u, id)
            // Check if document already exists (locally in cache or on server) before writing,
            // so retries or duplicate submissions never overwrite a later edit of the row.
            val existingDeterministic = try {
                ref.get().await()
            } catch (_: Exception) {
                null
            }
            if (existingDeterministic?.exists() == true) {
                return@runSuspendCatching id
            }
            // The raw legacy-lookup field is rules-bounded; deterministic identity is
            // fixed-size and therefore still supports arbitrarily long caller keys.
            val payload = expensePayload(e, idempotencyKey.takeIf { it.length < 128 })
            ref.set(payload).await()
            return@runSuspendCatching id
        }
        // Always mint a new id on insert so a crafted/stale id cannot overwrite history.
        val id = UUID.randomUUID().toString()
        val e = expense.copy(
            id = id,
            amount = roundAmount(expense.amount),
            note = expense.note.trim().take(2000)
        )
        expDoc(u, id).set(expensePayload(e, idempotencyKey)).await()
        id
    }

    override suspend fun updateExpense(expense: Expense): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        requireVerifiedEmail()
        val snap = expDoc(u, expense.id).get().await()
        if (!snap.exists()) throw IllegalStateException("EXPENSE_NOT_FOUND")
        val e = expense.copy(
            amount = roundAmount(expense.amount),
            note = expense.note.trim().take(2000)
        )
        expDoc(u, expense.id).set(expensePayload(e), SetOptions.merge()).await()
    }

    override suspend fun deleteExpense(expense: Expense): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        requireVerifiedEmail()
        expDoc(u, expense.id).delete().await()
    }

    override suspend fun deleteRecordExpense(expense: Expense, expectedUid: String): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        check(u == expectedUid) { "AUTH_ACCOUNT_CHANGED" }
        requireVerifiedEmail()
        expDoc(u, expense.id).delete().await()
    }

    override suspend fun duplicateRecordExpense(expense: Expense, expectedUid: String): Result<Unit> =
        insertExpenseScoped(expense.copy(id = "", dateMillis = System.currentTimeMillis()), null, expectedUid).map { }

    override suspend fun duplicateExpense(expense: Expense): Result<Unit> {
        return insertExpense(expense.copy(id = "", dateMillis = System.currentTimeMillis())).map { }
    }

    suspend fun restoreBackup(
        backup: BackupFormat.ParsedBackup,
        expectedUid: String,
    ): Result<RestoreUtils.RestoreResult> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        if (u != expectedUid) {
            throw IllegalStateException("AUTH_ACCOUNT_CHANGED")
        }
        requireVerifiedEmail()

        // Pre-flight check: query categories to detect conflicting transactionType
        val existingCatsSnap = catCol(u).get().await()
        val existingCatsById = existingCatsSnap.documents.associate { it.id to it.getString("transactionType") }

        for (c in backup.categories) {
            val existingType = existingCatsById[c.id]
            if (existingType != null && existingType != c.transactionType) {
                throw IllegalStateException("CATEGORY_TYPE_CONFLICT: ${c.name}")
            }
        }

        // 1. Categories in chunks of 400
        val categoryChunks = backup.categories.chunked(400)
        for (chunk in categoryChunks) {
            val batch = firestore.batch()
            for (c in chunk) {
                val ref = catDoc(u, c.id)
                val payload = buildMap<String, Any> {
                    put("name", c.name.trim().take(50))
                    put("iconName", c.iconName.take(50))
                    put("colorInt", c.colorInt.toLong())
                    put("transactionType", c.transactionType)
                    put("sortOrder", c.sortOrder)
                    put("updatedAt", c.updatedAt ?: System.currentTimeMillis())
                    put("id", c.id)
                }
                batch.set(ref, payload, SetOptions.merge())
            }
            batch.commit().await()
        }

        // 2. Expenses in chunks of 400
        val expenseChunks = backup.expenses.chunked(400)
        for (chunk in expenseChunks) {
            val batch = firestore.batch()
            for (e in chunk) {
                val ref = expDoc(u, e.id)
                val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
                val payload = buildMap<String, Any> {
                    put("amount", roundedAmount)
                    put("dateMillis", e.dateMillis)
                    put("categoryId", e.categoryId)
                    put("note", e.note.take(200))
                    put("transactionType", e.transactionType)
                    put("updatedAt", e.updatedAt ?: System.currentTimeMillis())
                    put("id", e.id)
                }
                batch.set(ref, payload, SetOptions.merge())
            }
            batch.commit().await()
        }

        // 3. Preferences
        val newTimestamp = maxOf(System.currentTimeMillis(), (backup.preferences.preferencesUpdatedAt ?: 0L) + 1L)
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

        val syncedPrefs = SyncedPreferences(
            currency = cur,
            locale = loc,
            themeMode = theme,
            onboardingComplete = true,
            dailyReminder = true,
            reminderHour = 19,
            reminderMinute = 0,
            analyticsPeriod = "this_month",
            monthlyBudget = budget,
            updatedAt = newTimestamp,
        )

        settingsPrefsDoc(u).set(
            buildMap<String, Any?> {
                put("currency", cur)
                put("locale", loc)
                put("themeMode", theme)
                put("onboardingComplete", true)
                put("dailyReminder", true)
                put("reminderHour", 19)
                put("reminderMinute", 0)
                put("analyticsPeriod", "this_month")
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
            )
        } else null

        val snapMetaMap = snap.get("snapshotMeta") as? Map<*, *>
        val snapshotMeta = if (snapMetaMap != null) {
            ReplacePlanner.SnapshotMeta(
                chunkCount = (snapMetaMap["chunkCount"] as? Number)?.toInt() ?: 1,
                totalExpenses = (snapMetaMap["totalExpenses"] as? Number)?.toInt() ?: 0,
                totalCategories = (snapMetaMap["totalCategories"] as? Number)?.toInt() ?: 0,
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
        val batch = firestore.batch()
        snap.documents.forEach { batch.delete(it.reference) }
        batch.commit().await()
    }

    private suspend fun createSafetySnapshot(
        u: String,
        operationId: String,
        expenses: List<Expense>,
        categories: List<Category>,
        preferences: SyncedPreferences?,
    ): ReplacePlanner.SnapshotMeta {
        val now = System.currentTimeMillis()
        val chunkSize = 200
        val chunkCount = if (expenses.isEmpty()) 1 else (expenses.size + chunkSize - 1) / chunkSize

        val currentRecurring = getRecurringBackupSection(u)
        val metaPayload = buildMap<String, Any?> {
            put("operationId", operationId)
            put("ownerUid", u)
            put("createdAt", now)
            put("chunkCount", chunkCount)
            put("totalExpenses", expenses.size)
            put("totalCategories", categories.size)
            put("categoryBudgets", getCategoryBudgets(u).map { it.payload() + ("categoryId" to it.categoryId) })
            put("recurringTemplates", currentRecurring.templates.map { it.payload() + ("id" to it.id) })
            put("recurringReceipts", currentRecurring.receipts.map { mapOf("id" to it.id, "templateId" to it.templateId, "scheduledDate" to it.scheduledDate, "expenseId" to it.expenseId, "createdAt" to it.createdAt) })
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
                        "updatedAt" to now,
                    )
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
        )
    }

    private data class SnapshotData(
        val operationId: String,
        val expenses: List<Expense>,
        val categories: List<Category>,
        val preferences: SyncedPreferences?,
        val categoryBudgets: List<com.aus.ausgegeben.data.entity.CategoryBudget>?,
        val recurringTemplates: List<RecurringTemplate>?,
        val recurringReceipts: List<OccurrenceReceipt>?,
    )

    private suspend fun readSafetySnapshot(u: String): SnapshotData {
        val metaSnap = snapshotDoc(u, "meta").get(Source.SERVER).await()
        if (!metaSnap.exists()) {
            throw IllegalStateException("SNAPSHOT_NOT_FOUND")
        }
        val operationId = metaSnap.getString("operationId") ?: ""
        val chunkCount = (metaSnap.getLong("chunkCount") ?: 1L).toInt()

        val rawCategories = metaSnap.get("categories") as? List<Map<String, Any?>> ?: emptyList()
        val categories = rawCategories.mapNotNull { m ->
            val name = (m["name"] as? String)?.trim().orEmpty()
            if (name.isEmpty()) null
            else Category(
                id = (m["id"] as? String).orEmpty(),
                name = name,
                iconName = (m["iconName"] as? String) ?: "shopping_bag",
                colorInt = ((m["colorInt"] as? Number)?.toLong() ?: 0xff6a9fd4).toInt(),
                transactionType = (m["transactionType"] as? String) ?: "expense",
                sortOrder = ((m["sortOrder"] as? Number)?.toInt() ?: 0),
            )
        }

        val rawPrefs = metaSnap.get("preferences") as? Map<String, Any?>
        val preferences = if (rawPrefs != null && rawPrefs.isNotEmpty()) {
            SyncedPreferences(
                currency = (rawPrefs["currency"] as? String) ?: "EUR",
                locale = (rawPrefs["locale"] as? String) ?: "en",
                themeMode = (rawPrefs["themeMode"] as? String) ?: "system",
                onboardingComplete = (rawPrefs["onboardingComplete"] as? Boolean) ?: true,
                dailyReminder = (rawPrefs["dailyReminder"] as? Boolean) ?: true,
                reminderHour = ((rawPrefs["reminderHour"] as? Number)?.toInt()) ?: 19,
                reminderMinute = ((rawPrefs["reminderMinute"] as? Number)?.toInt()) ?: 0,
                analyticsPeriod = (rawPrefs["analyticsPeriod"] as? String) ?: "this_month",
                monthlyBudget = (rawPrefs["monthlyBudget"] as? Number)?.toDouble(),
                updatedAt = (rawPrefs["updatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis(),
            )
        } else null

        val expenses = mutableListOf<Expense>()
        for (i in 0 until chunkCount) {
            val chunkSnap = snapshotDoc(u, "chunk_$i").get(Source.SERVER).await()
            check(chunkSnap.exists() && chunkSnap.getString("operationId") == operationId) { "SNAPSHOT_CHUNK_MISSING_OR_CHANGED" }
            if (chunkSnap.exists()) {
                val rawExpenses = chunkSnap.get("expenses") as? List<Map<String, Any?>> ?: emptyList()
                for (m in rawExpenses) {
                    val id = (m["id"] as? String).orEmpty()
                    if (id.isNotEmpty()) {
                        expenses.add(
                            Expense(
                                id = id,
                                amount = (m["amount"] as? Number)?.toDouble() ?: 0.0,
                                dateMillis = (m["dateMillis"] as? Number)?.toLong() ?: 0L,
                                categoryId = (m["categoryId"] as? String) ?: UNCATEGORIZED_ID,
                                note = (m["note"] as? String) ?: "",
                                transactionType = (m["transactionType"] as? String) ?: "expense",
                                deleted = false,
                            ),
                        )
                    }
                }
            }
        }

        val budgets = (metaSnap.get("categoryBudgets") as? List<Map<String, Any?>>)?.map { m -> com.aus.ausgegeben.data.entity.CategoryBudget(m["categoryId"] as String, (m["monthlyLimit"] as Number).toDouble(), (m["warningThresholdPercent"] as Number).toInt(), (m["updatedAt"] as Number).toLong()) }
        val recurringTemplates = (metaSnap.get("recurringTemplates") as? List<Map<String, Any?>>)?.mapNotNull { m ->
            val id = m["id"] as? String ?: return@mapNotNull null
            runCatching { RecurringTemplate.from(id, m) }.getOrNull()
        }
        val recurringReceipts = (metaSnap.get("recurringReceipts") as? List<Map<String, Any?>>)?.mapNotNull { m ->
            val id = m["id"] as? String ?: return@mapNotNull null
            val templateId = m["templateId"] as? String ?: return@mapNotNull null
            val scheduledDate = m["scheduledDate"] as? String ?: return@mapNotNull null
            val expenseId = m["expenseId"] as? String ?: return@mapNotNull null
            val createdAt = (m["createdAt"] as? Number)?.toLong() ?: 0L
            OccurrenceReceipt(id, templateId, scheduledDate, expenseId, createdAt)
        }
        return SnapshotData(
            categoryBudgets = budgets,
            recurringTemplates = recurringTemplates,
            recurringReceipts = recurringReceipts,
            operationId = operationId,
            expenses = expenses,
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

        var currentPhase = ReplacePlanner.RestorePhase.PREPARING
        var operationId = "replace_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}"

        try {
            val existingOp = getRestoreOperation(expectedUid)
            if (!isResume && existingOp != null &&
                existingOp.phase != ReplacePlanner.RestorePhase.COMPLETED &&
                existingOp.phase != ReplacePlanner.RestorePhase.ROLLED_BACK
            ) {
                throw IllegalStateException("UNRESOLVED_RESTORE_OPERATION: ${existingOp.phase}")
            }
            if (!isResume && existingOp != null &&
                (existingOp.phase == ReplacePlanner.RestorePhase.COMPLETED || existingOp.phase == ReplacePlanner.RestorePhase.ROLLED_BACK)
            ) {
                deleteSafetySnapshot(expectedUid)
            }
            if (isResume && existingOp != null) {
                operationId = existingOp.operationId
            }

            // Load authoritative current state
            val expSnap = expCol(expectedUid).get().await()
            val currentExpenses = expSnap.documents.mapNotNull { expenseFromDoc(it) }

            val catSnap = catCol(expectedUid).get().await()
            val currentCategories = catSnap.documents.mapNotNull { categoryFromDoc(it) }

            val prefDoc = settingsPrefsDoc(expectedUid).get().await()
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

            val initialOp = ReplacePlanner.RestoreOperationDoc(
                operationId = operationId,
                ownerUid = expectedUid,
                mode = "replace",
                backupFingerprint = fingerprint,
                phase = ReplacePlanner.RestorePhase.PREPARING,
                createdAt = if (isResume && existingOp != null) existingOp.createdAt else System.currentTimeMillis(),
                updatedAt = System.currentTimeMillis(),
                plannedCounts = plan.counts,
                initiatorPlatform = "android",
            )
            setRestoreOperation(expectedUid, initialOp)

            var snapshotMeta = if (isResume && existingOp?.snapshotMeta != null) existingOp.snapshotMeta else null
            if (snapshotMeta == null) {
                snapshotMeta = createSafetySnapshot(
                    u = expectedUid,
                    operationId = operationId,
                    expenses = currentExpenses,
                    categories = currentCategories,
                    preferences = currentPrefs,
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
                ),
            )

            currentPhase = ReplacePlanner.RestorePhase.APPLYING
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.APPLYING,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
                    progress = ReplacePlanner.RestoreJournalProgress(step = "categories", batchIndex = 0),
                ),
            )

            // 1. Categories in chunks of 400
            val categoryChunks = plan.categoriesToUpsert.chunked(400)
            var categoryBatchIndex = 0
            for (chunk in categoryChunks) {
                val batch = firestore.batch()
                for (c in chunk) {
                    val ref = catDoc(expectedUid, c.id)
                    val payload = buildMap<String, Any> {
                        put("name", c.name.trim().take(50))
                        put("iconName", c.iconName.take(50))
                        put("colorInt", c.colorInt.toLong())
                        put("transactionType", c.transactionType)
                        put("sortOrder", c.sortOrder)
                        put("updatedAt", c.updatedAt ?: System.currentTimeMillis())
                        put("id", c.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.commit().await()
                categoryBatchIndex++
                if (faultHooks?.failAfterCategoryBatch == categoryBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_CATEGORY_BATCH")
                }
            }

            // 2. Expenses upsert in chunks of 400
            val expenseUpsertChunks = plan.expensesToUpsert.chunked(400)
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
                        put("note", e.note.take(200))
                        put("transactionType", e.transactionType)
                        put("updatedAt", e.updatedAt ?: System.currentTimeMillis())
                        put("id", e.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.commit().await()
                expenseUpsertBatchIndex++
                if (faultHooks?.failAfterExpenseUpsertBatch == expenseUpsertBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_EXPENSE_UPSERT_BATCH")
                }
            }

            // 3. Stale expenses delete in chunks of 400
            val expenseDeleteChunks = plan.expenseIdsToDelete.chunked(400)
            var expenseDeleteBatchIndex = 0
            for (chunk in expenseDeleteChunks) {
                val batch = firestore.batch()
                for (id in chunk) {
                    batch.delete(expDoc(expectedUid, id))
                }
                batch.commit().await()
                expenseDeleteBatchIndex++
                if (faultHooks?.failAfterExpenseDeleteBatch == expenseDeleteBatchIndex) {
                    throw IllegalStateException("FAULT_INJECTED_AFTER_EXPENSE_DELETE_BATCH")
                }
            }

            // 4. Preferences update
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
                put("monthlyBudget", p.monthlyBudget)
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
                ),
            )

            if (faultHooks?.failDuringVerification == true) {
                throw IllegalStateException("FAULT_INJECTED_DURING_VERIFICATION")
            }

            if (plan.expenseIdsToDelete.isNotEmpty()) {
                val sampleId = plan.expenseIdsToDelete.first()
                val checkDoc = expDoc(expectedUid, sampleId).get().await()
                if (checkDoc.exists()) {
                    throw IllegalStateException("REPLACE_VERIFICATION_FAILED: deleted expense still exists")
                }
            }

            // 6. Completed
            currentPhase = ReplacePlanner.RestorePhase.COMPLETED
            setRestoreOperation(
                expectedUid,
                initialOp.copy(
                    phase = ReplacePlanner.RestorePhase.COMPLETED,
                    updatedAt = System.currentTimeMillis(),
                    snapshotMeta = snapshotMeta,
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
            if (currentPhase != ReplacePlanner.RestorePhase.PREPARING) {
                try {
                    setRestoreOperation(
                        expectedUid,
                        ReplacePlanner.RestoreOperationDoc(
                            operationId = operationId,
                            ownerUid = expectedUid,
                            mode = "replace",
                            backupFingerprint = ReplacePlanner.computeBackupFingerprint(backup),
                            phase = ReplacePlanner.RestorePhase.FAILED_RECOVERABLE,
                            createdAt = System.currentTimeMillis(),
                            updatedAt = System.currentTimeMillis(),
                            error = errorMsg.take(500),
                            failedFromPhase = currentPhase,
                            initiatorPlatform = "android",
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
        if (currentFp != operation.backupFingerprint) {
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

        if (!activeReplaceOperations.add(expectedUid)) {
            throw IllegalStateException("RESTORE_OPERATION_ALREADY_IN_PROGRESS")
        }

        try {
            setRestoreOperation(
                expectedUid,
                operation.copy(
                    phase = ReplacePlanner.RestorePhase.ROLLING_BACK,
                    updatedAt = System.currentTimeMillis(),
                ),
            )

            if (faultHooks?.failDuringRollback == true) {
                throw IllegalStateException("FAULT_INJECTED_DURING_ROLLBACK")
            }

            // 1. Categories
            for (chunk in snapshot.categories.chunked(400)) {
                val batch = firestore.batch()
                for (c in chunk) {
                    val ref = catDoc(expectedUid, c.id)
                    val payload = buildMap<String, Any> {
                        put("name", c.name.trim().take(50))
                        put("iconName", c.iconName.take(50))
                        put("colorInt", c.colorInt.toLong())
                        put("transactionType", c.transactionType)
                        put("sortOrder", c.sortOrder)
                        put("updatedAt", System.currentTimeMillis())
                        put("id", c.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.commit().await()
            }

            // 2. Expenses upsert
            val snapshotExpenseIds = snapshot.expenses.map { it.id }.toSet()
            for (chunk in snapshot.expenses.chunked(400)) {
                val batch = firestore.batch()
                for (e in chunk) {
                    val ref = expDoc(expectedUid, e.id)
                    val roundedAmount = (e.amount * 100.0).roundToLong() / 100.0
                    val payload = buildMap<String, Any> {
                        put("amount", roundedAmount)
                        put("dateMillis", e.dateMillis)
                        put("categoryId", e.categoryId)
                        put("note", e.note.take(200))
                        put("transactionType", e.transactionType)
                        put("updatedAt", System.currentTimeMillis())
                        put("id", e.id)
                    }
                    batch.set(ref, payload, SetOptions.merge())
                }
                batch.commit().await()
            }

            // 3. Delete expenses not in snapshot
            val currentExpSnap = expCol(expectedUid).get().await()
            val extraExpenseIds = currentExpSnap.documents
                .filter { it.id !in snapshotExpenseIds }
                .map { it.id }

            for (chunk in extraExpenseIds.chunked(400)) {
                val batch = firestore.batch()
                for (id in chunk) {
                    batch.delete(expDoc(expectedUid, id))
                }
                batch.commit().await()
            }

            snapshot.categoryBudgets?.let { applyBudgetCollection(expectedUid, it, true) }
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
                    put("monthlyBudget", restored.monthlyBudget)
                    put("updatedAt", restored.updatedAt)
                }
                settingsPrefsDoc(expectedUid).set(prefPayload, SetOptions.merge()).await()
                preferenceManager.applySyncedPreferences(restored)
            }

            // 5. Update journal to ROLLED_BACK
            setRestoreOperation(
                expectedUid,
                operation.copy(
                    phase = ReplacePlanner.RestorePhase.ROLLED_BACK,
                    updatedAt = System.currentTimeMillis(),
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

    /**
     * Wipe every known account document while retaining meta/accountDeletion. Queries
     * explicitly use SERVER so an offline or incomplete cache can never be mistaken for
     * an empty account before Firebase Auth is irreversibly deleted.
     */
    // DEL-1: iterates the shared FirestorePaths registry rather than an independent,
    // hand-maintained list — a new deletable collection/doc added there is picked up
    // here automatically, and FirestorePathsTest fails if a new path is ever added to
    // the registry without being classified as deletable or intentionally retained.
    override suspend fun deleteAllUserData(): Result<Unit> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        for (name in FirestorePaths.DELETABLE_USER_COLLECTIONS) {
            deleteCollectionBatched(userCol(u, name))
        }
        val docRefs = FirestorePaths.DELETABLE_USER_DOCS.map { userCol(u, it.collection).document(it.id) }
        for (ref in docRefs) {
            ref.delete().await()
        }

        for (name in FirestorePaths.DELETABLE_USER_COLLECTIONS) {
            check(userCol(u, name).limit(1).get(Source.SERVER).await().isEmpty) {
                "$name deletion verification failed"
            }
        }
        for (ref in docRefs) {
            check(!ref.get(Source.SERVER).await().exists()) {
                "${ref.path} deletion verification failed"
            }
        }
    }

    private suspend fun deleteCollectionBatched(
        col: com.google.firebase.firestore.CollectionReference,
    ) {
        while (true) {
            val snap = col.limit(400).get(Source.SERVER).await()
            if (snap.isEmpty) return
            val batch = firestore.batch()
            snap.documents.forEach { batch.delete(it.reference) }
            batch.commit().await()
        }
    }

    override suspend fun sumMonthExpenses(excludeExpenseId: String): Double {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: return 0.0
        val u = uid() ?: return 0.0
        val scoped = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", range.first)
            .whereLessThan("dateMillis", range.second)
            .whereEqualTo("transactionType", "expense")

        // sum() has no way to skip the legacy soft-deleted rows in a single pass:
        // `deleted` is absent on every row written since, so no equality filter
        // matches both shapes, and an inequality would collide with the range on
        // dateMillis. Summing the deleted subset on its own and subtracting it is
        // one extra aggregate read (still ~1 per 1,000 documents) and — unlike
        // purging the rows — leaves the user's data untouched.
        // Both passes need `amount` in their composite index, because an aggregation
        // indexes the field it aggregates, not just the ones it filters on:
        // (transactionType, dateMillis, amount) and (transactionType, deleted,
        // dateMillis, amount). Getting this wrong fails with FAILED_PRECONDITION at
        // runtime and nowhere else — the emulator invents indexes on demand, and the
        // caller swallows the error, so only a real device with a budget set shows it.
        val sumField = AggregateField.sum("amount")
        var total = try {
            val liveSnap = scoped.aggregate(sumField).get(AggregateSource.SERVER).await()
            val deletedSnap = scoped.whereEqualTo("deleted", true)
                .aggregate(sumField).get(AggregateSource.SERVER).await()
            // `as? Number` rather than getDouble(): an aggregate can surface as an
            // int64 depending on how the matched amounts were stored, and
            // getDouble()'s null-on-mismatch contract would coerce that to 0.0 —
            // silently projecting a budget of zero spent, the failure mode this
            // projection is already prone to (see the index note above).
            val liveSum = (liveSnap.get(sumField) as? Number)?.toDouble() ?: 0.0
            val deletedSum = (deletedSnap.get(sumField) as? Number)?.toDouble() ?: 0.0
            liveSum - deletedSum
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            // Offline or network unavailable: fall back to calculating the sum from the local Firestore cache.
            val cacheSnap = scoped.get(Source.CACHE).await()
            cacheSnap.documents
                .filter { it.getBoolean("deleted") != true }
                .sumOf { (it.get("amount") as? Number)?.toDouble() ?: 0.0 }
        }

        if (excludeExpenseId.isNotEmpty()) {
            val excluded = expDoc(u, excludeExpenseId).get().await()
            // getLong() coerces a Double-typed dateMillis; a raw `as? Long` cast
            // returns null on one and silently double-counts the edited row.
            val excludedDate = excluded.getLong("dateMillis")
            // Only subtract when it actually falls inside the summed set. A
            // soft-deleted row never does — it came straight back out above.
            if (excluded.getString("transactionType") == "expense" &&
                excluded.getBoolean("deleted") != true &&
                excludedDate != null &&
                excludedDate in range.first until range.second
            ) {
                // Same coercion rationale as the dateMillis read above: reach
                // through Number instead of getDouble() so a Long-typed amount
                // cannot vanish from the subtraction.
                total -= (excluded.get("amount") as? Number)?.toDouble() ?: 0.0
            }
        }

        return roundAmount(kotlin.math.max(0.0, total))
    }

    private val _recordIncomplete = MutableStateFlow(true)
    override val recordIncomplete: StateFlow<Boolean> = _recordIncomplete.asStateFlow()
    override val currentRecordAccountId: String? get() = authRepository.currentUserId
    override val recordAccountId: Flow<String?> = authRepository.authState.map { it?.uid }.distinctUntilChanged()

    /** Dedicated uncapped Records corpus; analytics/export keep their existing cap. */
    override val recordExpenses: Flow<List<Expense>> = observeRecordExpenses(null, null)
    override fun getRecordExpensesInRange(start: Long, end: Long): Flow<List<Expense>> = observeRecordExpenses(start, end)
    private val incompleteRecordQueries = mutableSetOf<String>()
    private val failedRecordQueries = mutableSetOf<String>()
    @Synchronized private fun markRecordFailed(key: String, failed: Boolean) {
        if (failed) failedRecordQueries.add(key) else failedRecordQueries.remove(key)
        if (failedRecordQueries.isEmpty()) markListenerHealthy(ListenerSource.RECORD_EXPENSES)
        else markListenerFailed(ListenerSource.RECORD_EXPENSES)
    }
    @Synchronized private fun markRecordIncomplete(key: String, incomplete: Boolean) {
        if (incomplete) incompleteRecordQueries.add(key) else incompleteRecordQueries.remove(key)
        _recordIncomplete.value = incompleteRecordQueries.isNotEmpty()
    }
    private fun observeRecordExpenses(start: Long?, end: Long?): Flow<List<Expense>> = perUserFlow(emptyList()) { u ->
        callbackFlow {
            val key = java.util.UUID.randomUUID().toString()
            val active = java.util.concurrent.atomic.AtomicBoolean(true)
            markRecordIncomplete(key, true)
            trySend(emptyList())
            val base = if (start == null || end == null) expCol(u) else expCol(u)
                .whereGreaterThanOrEqualTo("dateMillis", start).whereLessThan("dateMillis", end)
            val sub = base.orderBy("dateMillis", Query.Direction.DESCENDING)
                .addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snap, error ->
                    if (!active.get() || authRepository.currentUserId != u) return@addSnapshotListener
                    if (error != null) {
                        markRecordIncomplete(key, true)
                        markRecordFailed(key, true)
                    }
                    if (snap != null) {
                        markRecordIncomplete(key, snap.metadata.isFromCache)
                        markRecordFailed(key, false)
                        trySend(snap.documents.mapNotNull { expenseFromDoc(it)?.takeIf { e -> !e.deleted } })
                    }
                }
            awaitClose {
                active.set(false)
                sub.remove()
                markRecordIncomplete(key, false)
                markRecordFailed(key, false)
            }
        }
    }

    override val allExpenses: Flow<List<Expense>> = perUserFlow(emptyList()) { u ->
        callbackFlow {
            val sub = expCol(u)
                .orderBy("dateMillis", Query.Direction.DESCENDING)
                .limit(ALL_EXPENSES_CAP + 1)
                .addSnapshotListener { snap, error ->
                    if (error != null) {
                        Log.w(TAG, "expenses listener error", error)
                        markListenerFailed(ListenerSource.ALL_EXPENSES)
                    }
                    if (snap != null) {
                        markListenerHealthy(ListenerSource.ALL_EXPENSES)
                        val docs = snap.documents
                        val truncated = docs.size > ALL_EXPENSES_CAP.toInt()
                        if (truncated) {
                            Log.w(TAG, "allExpenses capped at $ALL_EXPENSES_CAP rows")
                        }
                        markTruncation(ListenerSource.ALL_EXPENSES, truncated)
                        val limited = if (truncated) docs.take(ALL_EXPENSES_CAP.toInt()) else docs
                        // Soft-deleted rows consume cap slots by design: `deleted`
                        // is absent on most rows, so no server-side inequality
                        // filter can express this exclusion without colliding
                        // with the dateMillis ordering. Web's getAllExpensesCapped
                        // behaves identically.
                        trySend(limited.mapNotNull { doc ->
                            expenseFromDoc(doc)?.takeIf { !it.deleted }
                        })
                    }
                }
            awaitClose {
                sub.remove()
                markListenerHealthy(ListenerSource.ALL_EXPENSES)
                markTruncation(ListenerSource.ALL_EXPENSES, false)
            }
        }
    }

    override suspend fun countExpensesForCategory(categoryId: String): Int {
        val u = uid() ?: return 0
        // Live rows only: the delete dialog says "N transactions will move to
        // Uncategorized", and soft-deleted rows are invisible everywhere else,
        // so counting them inflates the warning. (Reassignment itself still
        // repoints them — harmless, and it needs no count.)
        return expenseDocsForCategory(u, categoryId).count { it.getBoolean("deleted") != true }
    }

    override suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String): Result<Unit> =
        runSuspendCatching {
            requireVerifiedEmail()
            val u = uid() ?: throw IllegalStateException("Not signed in")
            val docs = expenseDocsForCategory(u, categoryId)
            var unfixable = 0
            docs.chunked(450).forEach { chunk ->
                try {
                    firestore.runBatch { batch ->
                        chunk.forEach { doc ->
                            batch.update(doc.reference, "transactionType", transactionType)
                        }
                    }.await()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (e: Exception) {
                    // Only split a permanently rules-rejected batch. Retrying a
                    // transient/quota/auth failure one row at a time can partially
                    // migrate a chunk and amplify both writes and failure impact.
                    if (!e.isPermissionDenied()) throw e
                    // Same failure shape reassignExpenses() guards against: a
                    // rules-rejected row fails its whole chunk, and the inert
                    // legacy rows documented in docs/maintenance.md can never
                    // pass validation on merge. Retry one document at a time so
                    // the healthy rows still land.
                    Log.w(TAG, "batch type change rejected — retrying one at a time", e)
                    chunk.forEach { doc ->
                        try {
                            doc.reference.update("transactionType", transactionType).await()
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (docError: Exception) {
                            if (!docError.isPermissionDenied()) throw docError
                            unfixable++
                            Log.w(TAG, "could not update type on ${doc.id}", docError)
                        }
                    }
                }
            }
            if (unfixable > 0) {
                throw IllegalStateException(
                    "$unfixable expense(s) could not be moved to the new type",
                )
            }
        }

    // ── Helpers ──

    /** Resolve strings against the user's saved app language (not system / stale context). */
    private suspend fun localizedContext(): Context {
        val lang = preferenceManager.languageFlow.first()
        val config = Configuration(appContext.resources.configuration)
        config.setLocales(LocaleList.forLanguageTags(lang))
        return appContext.createConfigurationContext(config)
    }

    private fun roundAmount(amount: Double): Double = CurrencyUtils.roundAmount(amount)

    /**
     * Firestore equality is type-sensitive. Older Android builds stored categoryId as a number;
     * UUID migration stores strings. Match both so delete/dedupe never miss legacy rows.
     */
    private suspend fun expenseDocsForCategory(u: String, categoryId: String): List<DocumentSnapshot> = coroutineScope {
        val byStringDeferred = async { expCol(u).whereEqualTo("categoryId", categoryId).get().await().documents }
        val byNumberDeferred = async {
            categoryId.toLongOrNull()?.let { n ->
                expCol(u).whereEqualTo("categoryId", n).get().await().documents
            }.orEmpty()
        }
        (byStringDeferred.await() + byNumberDeferred.await()).distinctBy { it.id }
    }

    /**
     * Point a set of expenses at [toCategoryId], tolerating documents the rules refuse.
     * Returns how many could not be reassigned.
     *
     * A Firestore batch commits all or nothing, so one row the rules reject took its
     * whole chunk of up to 450 down with it. That is not hypothetical: rows written
     * by builds predating the field allowlist carry extra keys, and on a real account
     * they were 39 of 89 expenses — enough that a single chunk almost always
     * contained one, so the sweep repaired nothing and retried on every launch.
     *
     * The batch stays the fast path; a rejected commit is retried one document at a
     * time so the healthy rows still land. Unfixable rows are counted, not thrown:
     * a document the rules will never accept must not keep blocking the ones they will.
     * Mirrors reassignExpenses() in the web repository.
     */
    private suspend fun reassignExpenses(
        docs: List<DocumentSnapshot>,
        toCategoryId: String,
    ): Int {
        var unfixable = 0
        docs.chunked(450).forEach { chunk ->
            try {
                firestore.runBatch { batch ->
                    chunk.forEach { doc ->
                        batch.update(doc.reference, "categoryId", toCategoryId)
                    }
                }.await()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                // Retry only a known permanent rules rejection. Transient, auth, quota,
                // and unknown failures must abort so category deletion keeps its source.
                if (!error.isPermissionDenied()) throw error
                chunk.forEach { doc ->
                    try {
                        doc.reference.update("categoryId", toCategoryId).await()
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (itemError: Exception) {
                        if (!itemError.isPermissionDenied()) throw itemError
                        unfixable += 1
                    }
                }
            }
        }
        return unfixable
    }

    private fun Exception.isPermissionDenied(): Boolean =
        this is com.google.firebase.firestore.FirebaseFirestoreException &&
            code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED

    /** Returns how many rows the rules refused, so callers can at least report it. */
    private suspend fun reassignCategoryExpenses(
        u: String,
        fromCategoryId: String,
        toCategoryId: String,
    ): Int = reassignExpenses(expenseDocsForCategory(u, fromCategoryId), toCategoryId)

    private suspend fun deleteCategoryInto(u: String, fromCategoryId: String, toCategoryId: String?) {
        val source = catDoc(u, fromCategoryId)
        check((source.get(com.google.firebase.firestore.Source.SERVER).await().getLong("recurringTemplateCount") ?: 0) == 0L) { "CATEGORY_HAS_RECURRING" }
        source.set(
            mapOf("deletionState" to "deleting", "updatedAt" to System.currentTimeMillis()),
            SetOptions.merge(),
        ).await()
        try {
            var linked = expenseDocsForCategory(u, fromCategoryId)
            if (toCategoryId == null) {
                if (linked.isNotEmpty()) throw CategoryInUseException()
            } else {
                if (linked.isNotEmpty()) {
                    if (toCategoryId == UNCATEGORIZED_ID) ensureUncategorizedCategory(u)
                    reassignExpenses(linked, toCategoryId)
                }
                linked = expenseDocsForCategory(u, fromCategoryId)
                if (linked.isNotEmpty()) throw CategoryInUseException()
            }
            firestore.runBatch { batch -> batch.delete(budgetCol(u).document(fromCategoryId)); batch.delete(source) }.await()
        } catch (cancelled: CancellationException) {
            reopenCategoryAfterFailedDelete(source)
            throw cancelled
        } catch (error: Exception) {
            reopenCategoryAfterFailedDelete(source)
            throw error
        }
    }

    private suspend fun reopenCategoryAfterFailedDelete(
        source: com.google.firebase.firestore.DocumentReference,
    ) {
        try {
            source.update(
                mapOf(
                    "deletionState" to FieldValue.delete(),
                    "updatedAt" to System.currentTimeMillis(),
                ),
            ).await()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (cleanupError: Exception) {
            Log.w(TAG, "category deletion barrier remains; retry will resume", cleanupError)
        }
    }

    /**
     * Reassign one restartable page of expenses whose categoryId no longer exists.
     */
    private data class OrphanRepairPageResult(
        val unfixable: Int,
        val complete: Boolean,
        val nextCursor: String?,
    )

    private suspend fun repairOrphanPage(u: String, cursor: String?): OrphanRepairPageResult {
        val catIds = catCol(u).get().await().documents.map { it.id }.toSet()
        if (catIds.isEmpty()) return OrphanRepairPageResult(0, true, null)
        var query = expCol(u).orderBy(FieldPath.documentId()).limit(ORPHAN_PAGE_SIZE)
        if (cursor != null) query = query.startAfter(cursor)
        val snap = query.get().await()
        val orphans = snap.documents.filter { doc ->
            // Soft-deleted rows are filtered out of every read path and excluded from
            // the month total, so repointing them would only spend writes on rows
            // nothing reads. They are left exactly as they are — legacy data is
            // tolerated here, never rewritten and never destroyed (see docs/maintenance.md).
            if (doc.getBoolean("deleted") == true) return@filter false
            val cid = doc.get("categoryId")?.toString().orEmpty()
            cid.isNotEmpty() && cid !in catIds
        }
        val unfixable = if (orphans.isNotEmpty()) {
            ensureUncategorizedCategory(u)
            reassignExpenses(orphans, UNCATEGORIZED_ID)
        } else 0
        Log.i(TAG, "Repaired ${orphans.size - unfixable} orphaned expense(s), $unfixable unfixable")
        return OrphanRepairPageResult(
            unfixable = unfixable,
            complete = snap.size() < ORPHAN_PAGE_SIZE.toInt(),
            nextCursor = snap.documents.lastOrNull()?.id,
        )
    }

    private suspend fun ensureUncategorizedCategory(u: String) {
        val ref = catDoc(u, UNCATEGORIZED_ID)
        val existing = ref.get().await()
        if (existing.exists()) {
            if (existing.getString("deletionState") == "deleting") {
                ref.update(
                    mapOf(
                        "deletionState" to FieldValue.delete(),
                        "updatedAt" to System.currentTimeMillis(),
                    ),
                ).await()
            }
            return
        }
        val uncategorized = Category(
            id = UNCATEGORIZED_ID,
            name = localizedContext().getString(R.string.record_unknown_category),
            iconName = "help_outline",
            colorInt = 0xff8e8e96.toInt(),
            transactionType = "expense",
            sortOrder = 999,
        )
        ref.set(categoryPayload(uncategorized)).await()
    }

    private fun categoryFromDoc(doc: DocumentSnapshot): Category? {
        val name = doc.getString("name")?.trim().orEmpty()
        if (name.isEmpty()) return null
        return Category(
            id = doc.id,
            name = name,
            iconName = doc.getString("iconName") ?: "shopping_bag",
            colorInt = (doc.getLong("colorInt") ?: 0xff6a9fd4).toInt(),
            transactionType = doc.getString("transactionType") ?: "expense",
            sortOrder = (doc.getLong("sortOrder") ?: 0).toInt(),
            migrationState = doc.getString("migrationState"),
            pendingTransactionType = doc.getString("pendingTransactionType"),
        )
    }

    private fun expenseFromDoc(doc: com.google.firebase.firestore.DocumentSnapshot): Expense? {
        val categoryId = when (val raw = doc.get("categoryId")) {
            is String -> raw
            is Number -> raw.toLong().toString()
            else -> UNCATEGORIZED_ID
        }
        return Expense(
            id = doc.id,
            amount = doc.getDouble("amount") ?: 0.0,
            dateMillis = doc.getLong("dateMillis") ?: 0L,
            categoryId = categoryId,
            note = doc.getString("note") ?: "",
            transactionType = doc.getString("transactionType") ?: "expense",
            deleted = doc.getBoolean("deleted") ?: false
        )
    }

    private fun categoryPayload(c: Category): Map<String, Any> = buildMap {
        put("name", c.name)
        put("iconName", c.iconName)
        put("colorInt", c.colorInt.toLong())
        put("transactionType", c.transactionType)
        put("sortOrder", c.sortOrder)
        put("updatedAt", System.currentTimeMillis())
        c.migrationState?.let { put("migrationState", it) }
        c.pendingTransactionType?.let { put("pendingTransactionType", it) }
    }

    // idempotencyKey is only ever written on insert. firestore.rules allows the field
    // but does not require it, so updates keep merging without having to carry it.
    private fun expensePayload(e: Expense, idempotencyKey: String? = null) = buildMap {
        put("amount", e.amount)
        put("dateMillis", e.dateMillis)
        put("categoryId", e.categoryId)
        put("note", e.note)
        put("transactionType", e.transactionType)
        put("updatedAt", System.currentTimeMillis())
        if (idempotencyKey != null) put("idempotencyKey", idempotencyKey)
    }
}
