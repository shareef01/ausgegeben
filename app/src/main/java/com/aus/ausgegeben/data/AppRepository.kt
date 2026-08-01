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
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
) {
    private val firestore get() = firestoreClient.get()
    companion object {
        const val UNCATEGORIZED_ID = "0"
        private const val TAG = "AppRepository"
        /** Soft cap matching web getAllExpensesCapped — unbounded listeners burn quota. */
        const val ALL_EXPENSES_SOFT_CAP = 5_000L
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
    val dataTruncated: StateFlow<Boolean> = _dataTruncated.asStateFlow()

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
        _listenerEpoch.value += 1
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

    private fun catCol(uid: String) = firestore.collection("users").document(uid).collection("categories")
    private fun expCol(uid: String) = firestore.collection("users").document(uid).collection("expenses")
    private fun metaCol(uid: String) = firestore.collection("users").document(uid).collection("meta")
    private fun settingsPrefsDoc(uid: String) =
        firestore.collection("users").document(uid).collection("settings").document("preferences")
    private fun catDoc(uid: String, id: String) = catCol(uid).document(id)
    private fun expDoc(uid: String, id: String) = expCol(uid).document(id)
    private fun dedupeMarkerDoc(uid: String) = metaCol(uid).document("dedupe")
    private fun accountDeletionDoc(uid: String) = metaCol(uid).document("accountDeletion")

    /** True when wipe finished but Auth delete failed — blocks re-seeding empty accounts. */
    suspend fun isAccountDeletionPending(): Boolean {
        val u = uid() ?: return false
        return runCatching {
            accountDeletionDoc(u).get().await().getBoolean("pendingDeletion") == true
        }.getOrDefault(false)
    }

    /**
     * Mark wipe-in-progress before [deleteAllUserData] so a failed Auth delete cannot
     * look like a fresh account after [ensureSeeded] re-seeds defaults.
     */
    suspend fun markAccountDeletionPending(): Result<Unit> = runCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        accountDeletionDoc(u).set(
            mapOf(
                "pendingDeletion" to true,
                "wipedAt" to System.currentTimeMillis(),
            ),
        ).await()
    }

    suspend fun ensureSeeded() {
        ensureSeededMutex.withLock {
            requireVerifiedEmail()
            val u = uid() ?: return
            // Nothing clears this marker, by design: re-seeding would dress a half-deleted
            // account up as a working fresh one. The consequence is that the account stays
            // unusable — no categories, so nothing can be recorded — until the user retries
            // deletion and it succeeds. That is the only exit, and it is what the failure
            // message tells them to do (settings_delete_account_incomplete).
            if (isAccountDeletionPending()) {
                Log.w(TAG, "ensureSeeded skipped: account deletion incomplete")
                return
            }
            val marker = dedupeMarkerDoc(u).get().await()
            val snap = catCol(u).get().await()
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
                // Manual calls to deduplicateCategories() (e.g. Settings' "Deduplicate
                // categories" button) bypass this marker entirely since they call the
                // function directly, not through ensureSeeded().
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
            if (!sweptNow && !marker.contains("orphansScannedAt")) {
                runCatching { sweepOrphanedExpenses(u) }
                    .onFailure { e -> Log.w(TAG, "orphan repair failed", e) }
            }
            // Remove legacy Uncategorized (id "0") so intentional deletes stick — but
            // only once nothing points at it. deleteCategory reassigns linked expenses to
            // this sink, and firestore.rules requires the target category to exist on
            // every expense update, so clearing it while still referenced left those rows
            // permanently uneditable (generic "save failed", no way to recover in-app).
            runCatching {
                if (catDoc(u, UNCATEGORIZED_ID).get().await().exists() &&
                    expenseDocsForCategory(u, UNCATEGORIZED_ID).isEmpty()
                ) {
                    catDoc(u, UNCATEGORIZED_ID).delete().await()
                }
            }
        }
    }

    suspend fun deduplicateCategories(): Result<Unit> = runCatching {
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
                reassignCategoryExpenses(u, fromCategoryId = dup.id, toCategoryId = master.id)
                // Narrow TOCTOU window (web parity): re-query immediately before delete.
                reassignCategoryExpenses(u, fromCategoryId = dup.id, toCategoryId = master.id)
                catDoc(u, dup.id).delete().await()
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
     * Run the orphan scan and record that it happened, so cold starts can skip it.
     * The scan reads the whole expenses collection; on Spark the daily read quota is
     * the only backstop this project has, so it must not run on every launch.
     * [deleteCategory] and [deduplicateCategories] already reassign their own expenses
     * before dropping a category, which leaves this sweep to catch only rows stranded
     * by an interrupted delete — a one-time pass, plus the manual "Deduplicate
     * categories" action, covers that.
     */
    private suspend fun sweepOrphanedExpenses(u: String) {
        repairOrphanedExpenses(u)
        dedupeMarkerDoc(u).set(
            mapOf("orphansScannedAt" to System.currentTimeMillis()),
            SetOptions.merge(),
        ).await()
    }

    // ── Categories ──

    val allCategories: Flow<List<Category>> = perUserFlow(emptyList()) { u ->
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

    suspend fun insertCategory(category: Category): Result<String> = runCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val id = UUID.randomUUID().toString()
        val c = category.copy(
            id = id,
            name = category.name.trim().take(80)
        )
        catDoc(u, id).set(categoryPayload(c)).await()
        id
    }

    suspend fun updateCategory(category: Category): Result<Unit> = runCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        val c = category.copy(name = category.name.trim().take(80))
        catDoc(u, category.id).set(categoryPayload(c), SetOptions.merge()).await()
    }

    suspend fun deleteCategory(category: Category): Result<Unit> = runCatching {
        requireVerifiedEmail()
        val u = uid() ?: throw IllegalStateException("Not signed in")
        // Deleting the uncategorized sentinel is allowed; linked expenses keep
        // categoryId "0" and the UI falls back to the unknown label.
        if (category.id == UNCATEGORIZED_ID) {
            catDoc(u, category.id).delete().await()
            return@runCatching
        }
        // SECURE: Move orphaned expenses to "Uncategorized" (match string + legacy numeric ids)
        ensureUncategorizedCategory(u)
        reassignCategoryExpenses(u, fromCategoryId = category.id, toCategoryId = UNCATEGORIZED_ID)
        // Narrow TOCTOU window (web parity): re-query immediately before delete so a
        // concurrent write attaching an expense mid-delete is less likely to orphan it.
        reassignCategoryExpenses(u, fromCategoryId = category.id, toCategoryId = UNCATEGORIZED_ID)
        catDoc(u, category.id).delete().await()
    }

    // ── Expenses ──

    fun getExpensesInRange(startMillis: Long, endMillis: Long): Flow<List<Expense>> =
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
                        trySend(snap.documents.mapNotNull { doc -> expenseFromDoc(doc) })
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
    suspend fun insertExpense(expense: Expense, idempotencyKey: String? = null): Result<String> = runCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        requireVerifiedEmail()
        if (idempotencyKey != null) {
            val existing = expCol(u)
                .whereEqualTo("idempotencyKey", idempotencyKey)
                .limit(1)
                .get()
                .await()
            existing.documents.firstOrNull()?.let { return@runCatching it.id }
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

    suspend fun updateExpense(expense: Expense): Result<Unit> = runCatching {
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

    suspend fun deleteExpense(expense: Expense): Result<Unit> = runCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        requireVerifiedEmail()
        expDoc(u, expense.id).delete().await()
    }

    suspend fun duplicateExpense(expense: Expense): Result<Unit> {
        return insertExpense(expense.copy(id = "", dateMillis = System.currentTimeMillis())).map { Unit }
    }

    /** Wipe all cloud docs for the signed-in user (account deletion). Keeps accountDeletion marker. */
    suspend fun deleteAllUserData(): Result<Unit> = runCatching {
        val u = uid() ?: throw IllegalStateException("Not signed in")
        deleteCollectionBatched(expCol(u))
        deleteCollectionBatched(catCol(u))
        runCatching { settingsPrefsDoc(u).delete().await() }
        runCatching { dedupeMarkerDoc(u).delete().await() }
    }

    private suspend fun deleteCollectionBatched(
        col: com.google.firebase.firestore.CollectionReference,
    ) {
        while (true) {
            val snap = col.limit(400).get().await()
            if (snap.isEmpty) break
            val batch = firestore.batch()
            snap.documents.forEach { batch.delete(it.reference) }
            batch.commit().await()
        }
    }

    suspend fun sumMonthExpenses(excludeExpenseId: String = ""): Double {
        val range = AnalyticsPeriod.THIS_MONTH.dateRangeMillis() ?: return 0.0
        val u = uid() ?: return 0.0
        val snap = expCol(u)
            .whereGreaterThanOrEqualTo("dateMillis", range.first)
            .whereLessThan("dateMillis", range.second)
            .whereEqualTo("transactionType", "expense")
            .get().await()
        val rawSum = snap.documents
            .filter { it.id != excludeExpenseId }
            .sumOf { it.getDouble("amount") ?: 0.0 }
        return roundAmount(rawSum)
    }

    val allExpenses: Flow<List<Expense>> = perUserFlow(emptyList()) { u ->
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
                        trySend(limited.mapNotNull { expenseFromDoc(it) })
                    }
                }
            awaitClose {
                sub.remove()
                markListenerHealthy(ListenerSource.ALL_EXPENSES)
                markTruncation(ListenerSource.ALL_EXPENSES, false)
            }
        }
    }

    suspend fun countExpensesForCategory(categoryId: String): Int {
        val u = uid() ?: return 0
        return expenseDocsForCategory(u, categoryId).size
    }

    suspend fun updateExpenseTypesForCategory(categoryId: String, transactionType: String): Result<Unit> =
        runCatching {
            requireVerifiedEmail()
            val u = uid() ?: throw IllegalStateException("Not signed in")
            val docs = expenseDocsForCategory(u, categoryId)
            docs.chunked(450).forEach { chunk ->
                firestore.runBatch { batch ->
                    chunk.forEach { doc ->
                        batch.update(doc.reference, "transactionType", transactionType)
                    }
                }.await()
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
            } catch (e: Exception) {
                Log.w(TAG, "batch reassign rejected — retrying one at a time", e)
                chunk.forEach { doc ->
                    try {
                        doc.reference.update("categoryId", toCategoryId).await()
                    } catch (docError: Exception) {
                        unfixable++
                        Log.w(TAG, "could not reassign ${doc.id}", docError)
                    }
                }
            }
        }
        return unfixable
    }

    private suspend fun reassignCategoryExpenses(u: String, fromCategoryId: String, toCategoryId: String) {
        reassignExpenses(expenseDocsForCategory(u, fromCategoryId), toCategoryId)
    }

    /**
     * Reassign expenses whose categoryId no longer exists (e.g. race orphan after
     * category delete). Capped to [ALL_EXPENSES_CAP] like other all-history paths.
     */
    private suspend fun repairOrphanedExpenses(u: String) {
        val catIds = catCol(u).get().await().documents.map { it.id }.toSet()
        if (catIds.isEmpty()) return
        val snap = expCol(u).limit(ALL_EXPENSES_CAP).get().await()
        val orphans = snap.documents.filter { doc ->
            val cid = doc.get("categoryId")?.toString().orEmpty()
            cid.isNotEmpty() && cid !in catIds
        }
        if (orphans.isEmpty()) return
        ensureUncategorizedCategory(u)
        val unfixable = reassignExpenses(orphans, UNCATEGORIZED_ID)
        Log.i(TAG, "Repaired ${orphans.size - unfixable} orphaned expense(s), $unfixable unfixable")
    }

    private suspend fun ensureUncategorizedCategory(u: String) {
        val ref = catDoc(u, UNCATEGORIZED_ID)
        if (ref.get().await().exists()) return
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
        return Category(
            id = doc.id,
            name = doc.getString("name") ?: "",
            iconName = doc.getString("iconName") ?: "shopping_bag",
            colorInt = (doc.getLong("colorInt") ?: 0xff6a9fd4).toInt(),
            transactionType = doc.getString("transactionType") ?: "expense",
            sortOrder = (doc.getLong("sortOrder") ?: 0).toInt()
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
        )
    }

    private fun categoryPayload(c: Category) = mapOf(
        "name" to c.name, "iconName" to c.iconName, "colorInt" to c.colorInt.toLong(),
        "transactionType" to c.transactionType, "sortOrder" to c.sortOrder,
        "updatedAt" to System.currentTimeMillis()
    )

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
