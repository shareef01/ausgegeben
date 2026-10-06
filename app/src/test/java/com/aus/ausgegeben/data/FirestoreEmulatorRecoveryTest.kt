package com.aus.ausgegeben.data

import android.app.Application
import android.os.Looper
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ApplicationProvider
import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.util.expenseDocumentId
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.MemoryCacheSettings
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.robolectric.Shadows
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID

/**
 * Production-path recovery integration tests (DATA-2) against the real Firebase
 * Android SDK and the real Firestore + Auth emulators.
 *
 * What these tests exercise, end to end, with NO fakes in the data path:
 *
 *   PreferenceManager (real DataStore, real PrefsCrypto)
 *     → durable multi-operation submission journal
 *     → AppRepository.insertExpense (real Firestore SDK commit, deterministic
 *       SHA-256(operationId) document identity)
 *     → simulated lost acknowledgement ([SimulatedLostAcknowledgement])
 *     → object-recreation "restart" ([buildProductionGraph])
 *     → AppRepository.ensureSeeded / PreferenceManager.reconcilePendingExpenseSubmissions
 *       (the production recovery entry points, existence-checked with Source.SERVER)
 *     → remote state asserted through the Firestore emulator's REST API
 *       (never through the SDK's local cache)
 *
 * Harness design (Option B of the remediation plan): the production classes are used
 * exactly as composed in the app — PreferenceManager, FirestoreClient, AuthRepository
 * and AppRepository are constructed directly with no DI overrides and no production
 * seams — and a fresh DEFAULT Firebase app per serial test is pointed
 * at the emulators via useEmulator() before anything can touch it. The only simulated
 * part is the single mechanism under test: an ambiguous write outcome, modeled at the
 * production ExpenseActions seam the ViewModel calls, and object recreation.
 *
 * Runs under Robolectric (JVM) because the Firestore Android SDK's OkHttp transport
 * performs real network I/O there — the tests talk to 127.0.0.1 directly, which keeps
 * the suite independent of an Android emulator/AVD and CI-runnable without KVM.
 * When the emulators are not running, every test skips via a JUnit assumption, so
 * `testProdDebugUnitTest` stays runnable offline; scripts/
 * run-firestore-recovery-tests.sh is the canonical entry point that starts the
 * emulators and fails CI if the tests were skipped instead of executed.
 *
 * NOT proven here: true Android process death or reopening DataStore in a new
 * process. Recovery recreates production wrappers around the real durable journal;
 * the DataStore delegate remains alive — see INT-4.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class FirestoreEmulatorRecoveryTest {

    private lateinit var preferenceManager: PreferenceManager
    private lateinit var firestoreClient: FirestoreClient
    private lateinit var authRepository: AuthRepository
    private lateinit var repository: AppRepository
    private lateinit var firebaseApp: FirebaseApp
    private lateinit var firebaseAuth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    private lateinit var projectId: String
    private lateinit var apiKey: String
    private var uid: String = ""
    private var categoryId: String = ""

    private val password = "correct horse battery staple"
    private var email: String = ""

    // ---- harness ----------------------------------------------------------------

    /** Emulator reachability probe; gates every test so offline runs skip cleanly. */
    private fun firestoreEmulatorReachable(): Boolean = try {
        val (code, _) = http("GET", "http://127.0.0.1:8080/")
        code in 200..299
    } catch (_: Exception) {
        false
    }

    private fun http(method: String, url: String, body: String? = null, headers: Map<String, String> = emptyMap()): Pair<Int, String> {
        val connection = URI.create(url).toURL().openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 5_000
        connection.readTimeout = 15_000
        for ((name, value) in headers) connection.setRequestProperty(name, value)
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray()) }
        }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        val status = connection.responseCode
        connection.disconnect()
        return status to text
    }

    private fun httpOkOrThrow(method: String, url: String, body: String? = null, headers: Map<String, String> = emptyMap()): String {
        val (code, text) = http(method, url, body, headers)
        assertTrue("$method $url -> HTTP $code: $text", code in 200..299)
        return text
    }

    /**
     * Creates a pre-verified account through the Auth emulator's REST API.
     *
     * emailVerified is a privileged field in the emulator (only OAuth2-admin requests
     * may set it), so the update must carry the `Authorization: Bearer owner` header
     * and address the account by localId — an idToken-only update silently drops it.
     */
    private fun createVerifiedUser(userEmail: String) {
        val signUp = JSONObject(
            httpOkOrThrow(
                "POST",
                "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey",
                JSONObject()
                    .put("email", userEmail)
                    .put("password", password)
                    .put("returnSecureToken", true)
                    .toString(),
            ),
        )
        httpOkOrThrow(
            "POST",
            "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=$apiKey",
            JSONObject()
                .put("localId", signUp.getString("localId"))
                .put("emailVerified", true)
                .toString(),
            headers = mapOf("Authorization" to "Bearer owner"),
        )
    }

    /**
     * The production graph, constructed exactly as the app composes it (no DI
     * overrides, no fakes). Re-invoking this simulates object recreation: every
     * repository wrapper is rebuilt; the DataStore delegate and SDK client remain alive.
     * INT-4 additionally replaces the SDK client to discard its memory cache.
     */
    private fun buildProductionGraph() {
        preferenceManager = PreferenceManager(ApplicationProvider.getApplicationContext())
        firestoreClient = FirestoreClient()
        authRepository = AuthRepository(firebaseAuth, preferenceManager, firestoreClient)
        repository = AppRepository(
            ApplicationProvider.getApplicationContext(),
            authRepository,
            preferenceManager,
            firestoreClient,
        )
    }

    // ---- execution wrapper --------------------------------------------------------
    //
    // The Firebase SDKs deliver Task results through the Android main Looper, which
    // Robolectric keeps paused while the test occupies the main thread — a coroutine
    // awaiting a Firebase Task inside runTest therefore suspends forever. Run the
    // suspend body on a worker thread and idle the main Looper from the main test
    // thread until it finishes: queued Firebase deliveries execute deterministically
    // as they arrive (this is pumping, not polling-with-sleeps-as-synchronization).

    private fun runRecoveryTest(body: suspend () -> Unit) {
        val worker = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            val future = worker.submit { runBlocking { body() } }
            val mainLooper = Shadows.shadowOf(Looper.getMainLooper())
            // Bounded virtual-time pump: idleFor advances the paused main looper by a
            // fixed step and returns — an unbounded drain (idle()) would never finish
            // while Firestore keeps scheduling recurring timers.
            val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(90)
            while (!future.isDone && System.nanoTime() < deadline) {
                mainLooper.idleFor(5, java.util.concurrent.TimeUnit.MILLISECONDS)
                Thread.sleep(5)
            }
            if (!future.isDone) {
                future.cancel(true)
                error("Recovery operation timed out after 90s (uid=$uid)")
            }
            try {
                future.get()
            } catch (e: java.util.concurrent.ExecutionException) {
                throw e.cause ?: e
            }
        } finally {
            worker.shutdownNow()
            check(worker.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS)) {
                "Recovery worker did not stop; unsafe to continue with shared DataStore"
            }
        }
    }

    @Before
    fun setUp() {
        // Emulator absent → skip cleanly so `testProdDebugUnitTest` stays runnable
        // offline. scripts/run-firestore-recovery-tests.sh fails CI if these tests end
        // up skipped instead of executed.
        val reachable = firestoreEmulatorReachable()
        if (System.getenv("RECOVERY_INTEGRATION_REQUIRED") == "true") {
            assertTrue("Required Firestore emulator is unavailable on 127.0.0.1:8080", reachable)
        } else {
            assumeTrue(reachable)
        }

        val context = ApplicationProvider.getApplicationContext<Application>()
        // FirestoreClient's production constructor uses the default app. A fresh
        // default app per serial JUnit test preserves that exact composition without
        // reflection or production changes. A unique application ID also isolates
        // Firebase's persisted Auth preferences (keyed by app name + application ID).
        FirebaseApp.getApps(context).forEach { existing ->
            check(existing.name == FirebaseApp.DEFAULT_APP_NAME) { "Unexpected Firebase app" }
            runRecoveryTest { FirebaseFirestore.getInstance(existing).terminate().await() }
            FirebaseAuth.getInstance(existing).signOut()
            existing.delete()
        }
        projectId = "demo-ausgegeben"
        // Auth 24.2's emulator endpoint registry (zzagq) is static and keyed by
        // API key. Reusing it notifies listeners belonging to deleted apps.
        // Emulator-only random keys isolate that registry without SDK reflection.
        apiKey = "fake-api-key-${UUID.randomUUID()}"
        firebaseApp = FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
            .setProjectId(projectId)
            .setApiKey(apiKey)
            .setApplicationId("1:123456789012:android:${UUID.randomUUID()}")
            .build())
        firebaseAuth = FirebaseAuth.getInstance(firebaseApp)
        firebaseAuth.useEmulator("127.0.0.1", 9099)
        email = "recovery-${UUID.randomUUID()}@example.com"
        createVerifiedUser(email)
        runRecoveryTest {
            context.dataStore.edit { it.clear() }
            firebaseAuth.signInWithEmailAndPassword(email, password).await()
            firebaseAuth.currentUser!!.reload().await()
            val token = firebaseAuth.currentUser!!.getIdToken(true).await()
            uid = firebaseAuth.currentUser!!.uid
            assertTrue("emulator account must be email-verified", firebaseAuth.currentUser!!.isEmailVerified)
            assertEquals(true, token.claims["email_verified"])
        }
        // No Firestore operation can start before authenticated credentials exist.
        db = FirebaseFirestore.getInstance(firebaseApp)
        configureFirestore(db)
        buildProductionGraph()

        // Production seeding: the app seeds default categories at sign-in before any
        // save, and the production rules only accept expenses whose categoryId
        // already exists. Saves in these tests therefore use a seeded category, as
        // they would in the app.
        runRecoveryTest {
            repository.ensureSeeded()
            categoryId = firstSeededCategoryId()
        }
    }

    /** Reads one seeded category id back through the authenticated emulator REST API. */
    private suspend fun firstSeededCategoryId(): String {
        val idToken = firebaseAuth.currentUser
            ?.getIdToken(false)?.await()?.token
            ?: error("no signed-in user for remote assertion")
        val text = httpOkOrThrow(
            "GET",
            "http://127.0.0.1:8080/v1/projects/$projectId/databases/(default)/documents" +
                "/users/$uid/categories",
            headers = mapOf("Authorization" to "Bearer $idToken"),
        )
        val documents = JSONObject(text).optJSONArray("documents") ?: JSONArray()
        assertTrue("ensureSeeded must create default categories", documents.length() > 0)
        // Document IDs are random: the first REST result may be income/transfer.
        // Production rules require the category type to match the expense type.
        val category = (0 until documents.length()).map { documents.getJSONObject(it) }
            .first { fieldString(it, "transactionType") == "expense" }
        return category.getString("name").substringAfterLast("/")
    }

    private fun configureFirestore(instance: FirebaseFirestore) {
        // Robolectric cannot execute this SDK's persistent SQLite cache. The durable
        // journal remains real DataStore; only the Firestore cache is memory-only.
        instance.firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setLocalCacheSettings(MemoryCacheSettings.newBuilder().build())
            .build()
        instance.useEmulator("127.0.0.1", 8080)
    }

    @After
    fun tearDown() {
        try {
            if (::db.isInitialized) runRecoveryTest { db.terminate().await() }
        } finally {
            try {
                if (::firebaseAuth.isInitialized) firebaseAuth.signOut()
                if (::firebaseApp.isInitialized) runRecoveryTest {
                    ApplicationProvider.getApplicationContext<Application>().dataStore.edit { it.clear() }
                }
            } finally {
                if (::firebaseApp.isInitialized) firebaseApp.delete()
            }
        }
    }

    // ---- observation helpers (production state + emulator REST, never the cache) --

    /**
     * Reads the pending journal through reconciliation's own enumeration, answering
     * "not written" for every entry so reconciliation keeps them — a non-mutating
     * observation of production state, not a fake.
     */
    private suspend fun pendingJournalIds(): List<String> {
        val seen = mutableListOf<String>()
        preferenceManager.reconcilePendingExpenseSubmissions { operationId -> seen += operationId; false }
        return seen
    }

    private fun expenseUrl(documentId: String? = null) =
        "http://127.0.0.1:8080/v1/projects/$projectId/databases/(default)/documents" +
            "/users/$uid/expenses" + (documentId?.let { "/$it" } ?: "")

    /**
     * Remote expense documents straight from the emulator REST API (no SDK cache).
     * The read carries the signed-in user's ID token because the emulator enforces
     * the production Firestore rules on REST reads too — assertions therefore pass
     * through the same authorization as production reads.
     */
    private suspend fun remoteExpenses(): Map<String, JSONObject> {
        val idToken = firebaseAuth.currentUser
            ?.getIdToken(false)?.await()?.token
            ?: error("no signed-in user for remote assertion")
        val text = httpOkOrThrow(
            "GET",
            expenseUrl(),
            headers = mapOf("Authorization" to "Bearer $idToken"),
        )
        val documents = JSONObject(text).optJSONArray("documents") ?: JSONArray()
        val out = LinkedHashMap<String, JSONObject>()
        for (i in 0 until documents.length()) {
            val doc = documents.getJSONObject(i)
            val documentId = doc.getString("name").substringAfterLast("/")
            val operationId = fieldString(doc, "idempotencyKey") ?: error("missing operation ID")
            assertEquals(expenseDocumentId(operationId), documentId)
            assertEquals(categoryId, fieldString(doc, "categoryId"))
            assertEquals("expense", fieldString(doc, "transactionType"))
            assertTrue("expected scenario payload", fieldString(doc, "note")!!.startsWith("INT-"))
            assertEquals(42.5, doc.getJSONObject("fields").getJSONObject("amount").getDouble("doubleValue"), 0.0)
            assertEquals("1700000000000", doc.getJSONObject("fields").getJSONObject("dateMillis").getString("integerValue"))
            out[documentId] = doc
        }
        return out
    }

    private fun fieldString(doc: JSONObject, name: String): String? =
        doc.getJSONObject("fields").optJSONObject(name)?.optString("stringValue")

    /** The production expense payload one submission attempt would write. */
    private fun expense(note: String) = Expense(
        amount = 42.5,
        dateMillis = 1_700_000_000_000L,
        categoryId = categoryId,
        note = note,
        transactionType = "expense",
    )

    /**
     * The ambiguous-outcome seam (INT-1/INT-2/INT-5): the production repository
     * REALLY commits to the emulator, and only then does the caller observe a
     * failure — exactly the "server write succeeded, client never learned" window
     * the journal and reconciliation exist for. Delegation keeps every other
     * ExpenseActions member on the real repository.
     */
    private class SimulatedLostAcknowledgement : IllegalStateException(
        "simulated: the server write may or may not have landed before the outcome was lost",
    )

    private fun ambiguousExpenseActions(): ExpenseActions = object : ExpenseActions by repository {
        override suspend fun insertExpense(expense: Expense, idempotencyKey: String?): Result<String> {
            val result = repository.insertExpense(expense, idempotencyKey) // REAL commit
            return if (result.isSuccess) Result.failure(SimulatedLostAcknowledgement()) else result
        }
    }

    private suspend fun insertWithAmbiguousOutcome(note: String): String {
        val operationId = preferenceManager.beginExpenseSubmission()
        val result = ambiguousExpenseActions().insertExpense(expense(note), operationId)
        assertTrue("expected post-commit ambiguity, got ${result.exceptionOrNull()}",
            result.exceptionOrNull() is SimulatedLostAcknowledgement)
        return operationId
    }

    // ---- INT-1 -------------------------------------------------------------------

    /**
     * Server success / client ambiguity: A's commit lands on the emulator, the caller
     * sees a failure, nothing completes the journal entry, and recovery must resolve
     * A from the SERVER (Source.SERVER existence check) — exactly once remotely.
     */
    @Test
    fun int1_serverSuccessWithAmbiguousOutcome_recoversExactlyOneRemoteRecord() = runRecoveryTest {
        // 1-3: begin + real Firestore write; 4: caller observes the lost outcome.
        val operationId = insertWithAmbiguousOutcome("INT-1 ambiguous")

        // 5: A is still pending locally (completeExpenseSubmission never ran).
        assertEquals(listOf(operationId), pendingJournalIds())

        // 6: recreate production wrappers around the real DataStore journal.
        buildProductionGraph()

        // 7: production recovery — ensureSeeded runs the real reconciliation with a
        // Source.SERVER existence check.
        repository.ensureSeeded()

        // 8: exactly one remote record, with the deterministic identity.
        val remote = remoteExpenses()
        assertEquals("recovery must not duplicate or lose the transaction", 1, remote.size)
        val docId = expenseDocumentId(operationId)
        val doc = remote[docId] ?: error("expected document $docId, got ${remote.keys}")
        assertEquals(operationId, fieldString(doc, "idempotencyKey"))

        // 9: the journal resolved away.
        assertTrue(pendingJournalIds().isEmpty())
    }

    // ---- INT-2 -------------------------------------------------------------------

    /**
     * The DATA-2 integration case: A ambiguous (write landed), then an explicit,
     * fully successful B. Two explicit saves must end as exactly two remote records,
     * and A must still have been existence-checked independently afterwards — a
     * single-slot journal would have lost A's entry when B began and could never
     * have reconciled it.
     */
    @Test
    fun int2_ambiguousA_thenExplicitB_yieldsExactlyTwoRemoteRecords() = runRecoveryTest {
        val a = insertWithAmbiguousOutcome("INT-2 ambiguous A")

        // Explicit successful save B through the production path.
        val b = preferenceManager.beginExpenseSubmission()
        assertTrue("explicit saves must mint distinct operation IDs", a != b)
        val bWrite = repository.insertExpense(expense("INT-2 explicit B"), b)
        assertTrue("explicit save B failed: ${bWrite.exceptionOrNull()}", bWrite.isSuccess)
        preferenceManager.completeExpenseSubmission(b)

        // A survives B's full lifecycle; B is gone from the journal.
        assertEquals("A must still be pending after B completed", listOf(a), pendingJournalIds())

        // Recovery through the production entry point. The pre-recovery observation
        // records that A is (still) tracked — on a single-slot journal this is where
        // the test would already fail with an empty journal.
        buildProductionGraph()
        assertEquals(listOf(a), pendingJournalIds())
        repository.ensureSeeded()

        val remote = remoteExpenses()
        assertEquals("two explicit saves must be exactly two remote records", 2, remote.size)
        assertEquals(setOf(expenseDocumentId(a), expenseDocumentId(b)), remote.keys)
        assertEquals(a, fieldString(remote[expenseDocumentId(a)]!!, "idempotencyKey"))
        assertEquals(b, fieldString(remote[expenseDocumentId(b)]!!, "idempotencyKey"))
        assertEquals("INT-2 ambiguous A", fieldString(remote[expenseDocumentId(a)]!!, "note"))
        assertEquals("INT-2 explicit B", fieldString(remote[expenseDocumentId(b)]!!, "note"))
        assertTrue("journal must end empty after reconciliation", pendingJournalIds().isEmpty())
    }

    // ---- INT-3 -------------------------------------------------------------------

    /**
     * Retry of the same logical attempt against real Firestore: reusing one operation
     * id must produce exactly one remote document whose id is the production
     * derivation (SHA-256 of the id) and whose idempotencyKey is the id itself.
     */
    @Test
    fun int3_retryWithSameOperationId_commitsExactlyOneRemoteDocument() = runRecoveryTest {
        val operationId = preferenceManager.beginExpenseSubmission()

        val first = repository.insertExpense(expense("INT-3 retry"), operationId)
        val second = repository.insertExpense(expense("INT-3 retry"), operationId)
        assertTrue("first insert failed: ${first.exceptionOrNull()}", first.isSuccess)
        assertTrue("retry failed: ${second.exceptionOrNull()}", second.isSuccess)
        assertEquals("the deterministic identity must be stable across retries", first.getOrThrow(), second.getOrThrow())

        preferenceManager.completeExpenseSubmission(operationId)

        val remote = remoteExpenses()
        assertEquals("a retry of the same attempt must not create a second expense", 1, remote.size)
        assertEquals(expenseDocumentId(operationId), remote.keys.single())
        assertEquals(operationId, fieldString(remote.values.single(), "idempotencyKey"))
        assertTrue(pendingJournalIds().isEmpty())
    }

    // ---- INT-4 -------------------------------------------------------------------

    /**
     * The pending entry survives reconstruction of the production wrappers (a new
     * PreferenceManager, FirestoreClient, AuthRepository and AppRepository), which
     * share the real DataStore delegate. Firestore is replaced with an empty memory
     * cache. This is object recreation, not an OS restart or DataStore reopen.
     */
    @Test
    fun int4_recoveryFromReconstructedProductionGraph_usesServerWithEmptyCache() = runRecoveryTest {
        val operationId = preferenceManager.beginExpenseSubmission()
        // The write lands; local completion has not been processed before recreation.
        val aWrite = repository.insertExpense(expense("INT-4 restart"), operationId)
        assertTrue("A write failed: ${aWrite.exceptionOrNull()}", aWrite.isSuccess)

        // Discard the SDK memory cache too. A Source.CACHE reconciliation cannot
        // find the previously committed document on this new client.
        val oldDb = db
        oldDb.terminate().await()
        db = FirebaseFirestore.getInstance(firebaseApp)
        assertTrue("terminate must evict the old SDK instance", oldDb !== db)
        configureFirestore(db)
        buildProductionGraph()

        // The real journal still holds the pending operation after wrapper recreation.
        assertEquals(listOf(operationId), pendingJournalIds())

        repository.ensureSeeded()

        val remote = remoteExpenses()
        assertEquals(1, remote.size)
        assertEquals(operationId, fieldString(remote[expenseDocumentId(operationId)]!!, "idempotencyKey"))
        assertTrue(pendingJournalIds().isEmpty())
        // Records uses a fresh uncapped SDK listener and a half-open date query.
        val target = expenseDocumentId(operationId)
        val records = withTimeout(15000) { repository.recordExpenses.first { it.any { e -> e.id == target } } }
        assertEquals(listOf(target), records.map { it.id })
        val date = records.single().dateMillis
        val inRange = withTimeout(15000) { repository.getRecordExpensesInRange(date, date + 1).first { it.isNotEmpty() } }
        assertEquals(listOf(target), inRange.map { it.id })
        // Rebuilt production graph also reconciles recurring commits with an empty cache.
        val recurring = RecurringRepository(firestoreClient, authRepository)
        val now = System.currentTimeMillis()
        val template = com.aus.ausgegeben.data.entity.RecurringTemplate(
            UUID.randomUUID().toString(), 15.0, categoryId, "INT-4 recurring", "expense", "monthly", 1,
            "2024-01-31", "2024-01-31", "Europe/Berlin", true, 0, "2024-01-31", now, now
        )
        recurring.save(uid, template, null, now)
        recurring.materialize(uid, template.id, now)
        // Lost acknowledgement: no caller completion is stored. Recreate and retry.
        buildProductionGraph()
        val rebuilt = RecurringRepository(firestoreClient, authRepository)
        assertEquals(0, rebuilt.reconcile(uid, now))
        val key = com.aus.ausgegeben.data.entity.Recurrence.key(template.id, "2024-01-31")
        suspend fun recurringRemote(): JSONArray {
            val token = firebaseAuth.currentUser!!.getIdToken(false).await().token!!
            val (code, text) = http("GET", expenseUrl(), headers = mapOf("Authorization" to "Bearer $token"))
            assertEquals(200, code)
            return JSONObject(text).getJSONArray("documents")
        }
        val occurrences = recurringRemote()
        assertEquals(2, occurrences.length())
        val generated = (0 until occurrences.length()).map { occurrences.getJSONObject(it) }.single { it.getString("name").endsWith("/" + expenseDocumentId(key)) }
        assertEquals(key, fieldString(generated, "idempotencyKey"))
        assertEquals(15.0, generated.getJSONObject("fields").getJSONObject("amount").getDouble("doubleValue"), 0.0)
        val saved = rebuilt.getAll(uid).single()
        rebuilt.remove(uid, saved.id, saved.updatedAt)
        assertEquals(2, recurringRemote().length())

        val requestedCat = com.aus.ausgegeben.data.entity.Category(name = "Budget test", iconName = "restaurant", colorInt = 0)
        val cat = requestedCat.copy(id = repository.insertCategory(requestedCat).getOrThrow())
        val budget = com.aus.ausgegeben.data.entity.CategoryBudget(cat.id, 12.34, 80)
        val initialBudgetSave = repository.saveCategoryBudget(uid, cat.id, budget, null)
        assertTrue("Budget save failed: ${initialBudgetSave.exceptionOrNull()}", initialBudgetSave.isSuccess)
        val first = withTimeout(15000) { repository.categoryBudgets.first { !it.incomplete && it.budgets.isNotEmpty() } }.budgets.single()
        assertEquals(12.34, first.monthlyLimit, 0.0)
        assertTrue(repository.saveCategoryBudget(uid, cat.id, budget.copy(monthlyLimit = 25.0), first.updatedAt).isSuccess)
        assertTrue(repository.saveCategoryBudget(uid, cat.id, budget, first.updatedAt).isFailure)
        // All three schema versions exercise the production Android restore/snapshot paths.
        val format = com.aus.ausgegeben.util.BackupFormat
        val prefs = com.aus.ausgegeben.util.BackupFormat.BackupPreferences("EUR", null)
        val modernJson = format.createBackupJson(prefs, listOf(cat), emptyList(), "test", categoryBudgets = emptyList())
        val legacyJson = JSONObject(modernJson).apply { put("schemaVersion", 1); remove("categoryBudgets"); remove("recurring") }.toString()
        val legacy = format.parseBackup(legacyJson)!!
        assertTrue(repository.restoreBackup(legacy, uid).isSuccess)
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        assertTrue(repository.executeReplace(legacy, uid).isSuccess)
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        val v2Json = JSONObject(modernJson).apply { put("schemaVersion", 2); remove("recurring") }.toString()
        val v2 = format.parseBackup(v2Json)!!
        assertTrue(repository.restoreBackup(v2, uid).isSuccess)
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        val newCat = cat.copy(id = "restore-created-budget", name = "New budget")
        val modern = format.parseBackup(format.createBackupJson(prefs, listOf(cat, newCat), emptyList(), "test", categoryBudgets = listOf(budget.copy(monthlyLimit = 50.0), budget.copy(categoryId = newCat.id))))!!
        assertTrue(repository.restoreBackup(modern.copy(categoryBudgets = listOf(budget.copy(monthlyLimit = 50.0))), uid).isSuccess)
        assertEquals(50.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        assertTrue(repository.saveCategoryBudget(uid, cat.id, budget.copy(monthlyLimit = 25.0), repository.getCategoryBudgets(uid).single().updatedAt).isSuccess)
        assertTrue(repository.executeReplace(modern, uid).isSuccess)
        assertEquals(2, repository.getCategoryBudgets(uid).size)
        assertEquals(50.0, repository.getCategoryBudgets(uid).first { it.categoryId == cat.id }.monthlyLimit, 0.0)
        assertTrue(repository.rollbackReplace(repository.getRestoreOperation(uid)!!, uid).isSuccess)
        assertEquals(listOf(cat.id), repository.getCategoryBudgets(uid).map { it.categoryId })
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        val empty = format.parseBackup(modernJson)!!
        assertTrue(repository.executeReplace(empty, uid).isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
        val emptyOperation = repository.getRestoreOperation(uid)!!
        assertTrue(repository.rollbackReplace(emptyOperation.copy(operationId = "stale-operation"), uid).isFailure)
        db.disableNetwork().await()
        try { assertTrue(repository.rollbackReplace(emptyOperation, uid).isFailure) }
        finally { db.enableNetwork().await() }
        assertEquals(com.aus.ausgegeben.util.ReplacePlanner.RestorePhase.COMPLETED, repository.getRestoreOperation(uid)!!.phase)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
        assertTrue(repository.rollbackReplace(emptyOperation, uid).isSuccess)
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        val onlineRevision = repository.getCategoryBudgets(uid).single().updatedAt
        db.disableNetwork().await()
        try {
            assertTrue(runCatching { repository.getCategoryBudgets(uid) }.isFailure)
            assertTrue(repository.saveCategoryBudget(uid, newCat.id, budget.copy(categoryId = newCat.id), null).isFailure)
            assertTrue(repository.saveCategoryBudget(uid, cat.id, budget, onlineRevision).isFailure)
            assertTrue(repository.saveCategoryBudget(uid, cat.id, null, onlineRevision).isFailure)
        }
        finally { db.enableNetwork().await() }
        assertEquals(25.0, repository.getCategoryBudgets(uid).single().monthlyLimit, 0.0)
        assertTrue(repository.updateCategory(cat.copy(transactionType = "income")).isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
        assertTrue(repository.updateCategory(cat.copy(transactionType = "expense")).isSuccess)
        assertTrue(repository.saveCategoryBudget(uid, cat.id, budget, null).isSuccess)
        assertTrue(repository.saveCategoryBudget(uid, cat.id, null, repository.getCategoryBudgets(uid).single().updatedAt).isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
        assertTrue(repository.saveCategoryBudget(uid, cat.id, budget, null).isSuccess)
        assertTrue(repository.updateCategory(cat.copy(transactionType = "transfer")).isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
        val requestedDeleteCat = cat.copy(name = "Delete budget")
        val deleteCat = requestedDeleteCat.copy(id = repository.insertCategory(requestedDeleteCat).getOrThrow())
        assertTrue(repository.saveCategoryBudget(uid, deleteCat.id, budget.copy(categoryId = deleteCat.id), null).isSuccess)
        assertTrue(repository.deleteCategory(deleteCat).isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
    }

    // ---- INT-5 -------------------------------------------------------------------

    /**
     * Late completion: A's write lands and A's outcome becomes known AFTER B began —
     * completing A late must remove only A; B remains pending and is reconciled
     * independently afterwards.
     */
    @Test
    fun int5_lateCompletionOfA_removesOnlyA_andBReconcilesIndependently() = runRecoveryTest {
        val a = insertWithAmbiguousOutcome("INT-5 ambiguous A")
        val b = preferenceManager.beginExpenseSubmission()
        // B's write also lands, but B's outcome stays unprocessed for now.
        val bWrite = repository.insertExpense(expense("INT-5 pending B"), b)
        assertTrue("B write failed: ${bWrite.exceptionOrNull()}", bWrite.isSuccess)

        // Both pending before anything resolves.
        assertEquals(setOf(a, b), pendingJournalIds().toSet())

        // A's outcome arrives late: completing A must not erase B.
        preferenceManager.completeExpenseSubmission(a)
        assertEquals("B must survive A's late completion", listOf(b), pendingJournalIds())

        buildProductionGraph()
        assertEquals(listOf(b), pendingJournalIds())
        repository.ensureSeeded()

        val remote = remoteExpenses()
        assertEquals(2, remote.size)
        assertEquals(setOf(expenseDocumentId(a), expenseDocumentId(b)), remote.keys)
        assertTrue(pendingJournalIds().isEmpty())
    }

    // ---- INT-6 -------------------------------------------------------------------

    /**
     * Account isolation: sign-out clears the whole journal (production
     * AuthRepository.signOut → clearAccountLocalState), so the next account cannot
     * reconcile, expose, or delete the previous account's pending operations.
     */
    @Test
    fun int6_signOutClearsPendingOperations_nextAccountCannotReconcileThem() = runRecoveryTest {
        val operationId = preferenceManager.beginExpenseSubmission()
        val aWrite = repository.insertExpense(expense("INT-6 user A"), operationId)
        assertTrue("A write failed: ${aWrite.exceptionOrNull()}", aWrite.isSuccess)
        // Keep it pending: user A's outcome was never processed.
        assertEquals(listOf(operationId), pendingJournalIds())

        assertTrue(repository.saveCategoryBudget(uid,categoryId,com.aus.ausgegeben.data.entity.CategoryBudget(categoryId,100.0),null).isSuccess)
        val userAUrl = expenseUrl(expenseDocumentId(operationId))
        assertEquals("A's committed expense must exist remotely", 1, remoteExpenses().size)
        val userAToken = firebaseAuth.currentUser!!.getIdToken(false).await().token!!
        val userAUid = uid

        // Production sign-out path: Auth.signOut → clearAccountLocalState → journal gone.
        // clearOfflineCache terminates the Firestore instance and installs a fresh one,
        // which must be re-piped to the emulator (and kept on a memory cache — see
        // setUp) before anything can use it.
        authRepository.signOut()
        val oldDb = db
        db = firestoreClient.get()
        assertTrue("terminate must evict the old SDK instance", oldDb !== db)
        configureFirestore(db)
        assertTrue("sign-out must abandon pending submissions", pendingJournalIds().isEmpty())

        // A different verified account signs in and recovers: nothing of A remains.
        email = "recovery-${UUID.randomUUID()}@example.com"
        createVerifiedUser(email)
        firebaseAuth.signInWithEmailAndPassword(email, password).await()
        firebaseAuth.currentUser?.reload()?.await()
        firebaseAuth.currentUser?.getIdToken(true)?.await()
        uid = firebaseAuth.currentUser?.uid ?: error("no second user")
        buildProductionGraph()

        assertEquals(
            "user B must have nothing of user A to reconcile",
            emptyList<String>(),
            pendingJournalIds(),
        )
        assertTrue("accounts must have distinct UIDs", userAUid != uid)
        val bBudgets = withTimeout(15000) { repository.categoryBudgets.first { !it.incomplete } }
        assertTrue(bBudgets.budgets.isEmpty())
        assertEquals("user B starts with no remote expenses", 0, remoteExpenses().size)
        assertTrue(repository.deleteRecordExpense(expense("old A action").copy(id = expenseDocumentId(operationId)), userAUid).isFailure)
        assertTrue(repository.duplicateRecordExpense(expense("old A action"), userAUid).isFailure)
        assertEquals("stale record actions must not write B", 0, remoteExpenses().size)
        val bRecords = withTimeout(15000) { repository.recordExpenses.first { !repository.recordIncomplete.value } }
        assertTrue("Records must not expose user A to user B", bRecords.isEmpty())
        repository.ensureSeeded()
        categoryId = firstSeededCategoryId()
        assertTrue(pendingJournalIds().isEmpty())
        assertEquals("recovery must not copy A into B's namespace", 0, remoteExpenses().size)
        val userBToken = firebaseAuth.currentUser!!.getIdToken(false).await().token!!
        assertEquals("production rules must deny B access to A", 403,
            http("GET", userAUrl, headers = mapOf("Authorization" to "Bearer $userBToken")).first)
        val userADoc = JSONObject(httpOkOrThrow("GET", userAUrl,
            headers = mapOf("Authorization" to "Bearer $userAToken")))
        assertEquals(operationId, fieldString(userADoc, "idempotencyKey"))
        assertTrue(repository.saveCategoryBudget(uid,categoryId,com.aus.ausgegeben.data.entity.CategoryBudget(categoryId,100.0),null).isSuccess)
        val expenseCategories = withTimeout(15000) { repository.allCategories.first { cats -> cats.count { it.transactionType=="expense" } >= 3 } }.filter { it.transactionType=="expense" && it.id!=categoryId }.take(2)
        expenseCategories.forEach { c -> assertTrue(repository.saveCategoryBudget(uid,c.id,com.aus.ausgegeben.data.entity.CategoryBudget(c.id,50.0),null).isSuccess) }
        assertEquals(3,repository.getCategoryBudgets(uid).size)
        assertTrue(repository.markAccountDeletionPending().isSuccess)
        assertTrue(repository.deleteAllUserData().isSuccess)
        assertTrue(repository.getCategoryBudgets(uid).isEmpty())
    }
}
