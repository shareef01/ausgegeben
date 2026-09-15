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
import com.aus.ausgegeben.util.CategoryDedupe
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.dateRangeMillis
import com.aus.ausgegeben.util.expenseDocumentId
import com.aus.ausgegeben.util.runSuspendCatching
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
import kotlin.math.round
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppRepository @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val authRepository: AuthRepository,
    private val preferenceManager: PreferenceManager,
    private val firestoreClient: FirestoreClient,
) : CategoryActions, ExpenseActions, AccountActions {
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

    /** Which realtime listeners are currently broken. See [markListenerFailed]. */
    private enum class ListenerSource { CATEGORIES, EXPENSES_IN_RANGE, ALL_EXPENSES }

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
    override suspend fun insertExpense(expense: Expense, idempotencyKey: String?): Result<String> = runSuspendCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        requireVerifiedEmail()
        if (idempotencyKey != null) {
            // Historical releases used random ids. Return an existing legacy row before
            // deriving the modern identity so an upgrade does not duplicate history.
            val existing = expCol(u)
                .whereEqualTo("idempotencyKey", idempotencyKey)
                .limit(1)
                .get()
                .await()
            existing.documents.firstOrNull()?.let { return@runSuspendCatching it.id }

            val id = expenseDocumentId(idempotencyKey)
            val e = expense.copy(
                id = id,
                amount = roundAmount(expense.amount),
                note = expense.note.trim().take(2000),
            )
            val ref = expDoc(u, id)
            // The raw legacy-lookup field is rules-bounded; deterministic identity is
            // fixed-size and therefore still supports arbitrarily long caller keys.
            val payload = expensePayload(e, idempotencyKey.takeIf { it.length < 128 })
            firestore.runTransaction { transaction ->
                val deterministic = transaction.get(ref)
                if (!deterministic.exists()) transaction.set(ref, payload)
                id
            }.await()
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

    override suspend fun duplicateExpense(expense: Expense): Result<Unit> {
        return insertExpense(expense.copy(id = "", dateMillis = System.currentTimeMillis())).map { Unit }
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
            source.delete().await()
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
