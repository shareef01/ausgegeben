package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.SyncedPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.CategoryBudget
import com.aus.ausgegeben.data.entity.Expense
import com.aus.ausgegeben.data.entity.RecurringTemplate

/**
 * Strict reader for the `restoreSnapshot` payload (AUD-006).
 *
 * The safety snapshot is the only recovery path for a replace restore, and rollback writes it
 * back as the authoritative state: `applyRecurringCollection(replace = true)` deletes every
 * template that is not in the list it is handed, and the rollback itself deletes the expenses
 * the snapshot does not contain. A row this reader *silently* drops or defaults is therefore
 * destructive, not merely lossy. Before this object existed, `readSafetySnapshot`
 *
 *  - turned a container of the wrong shape into `emptyList()`, which every consumer reads as
 *    "the account had no expenses/categories";
 *  - dropped categories with a blank name and expenses with a blank id, while defaulting a
 *    missing `amount` to 0.00 and a missing `dateMillis` to 1970 — silent financial corruption;
 *  - dropped malformed recurring templates (`mapNotNull { runCatching { … } }`) and receipts
 *    (`?: continue`), which a replace-rollback would then delete from the account;
 *  - threw a raw `ClassCastException` for a malformed budget row.
 *
 * Everything here is fail-closed: the first malformed field throws [InvalidSnapshotException]
 * naming its path, and the caller leaves the journal at `FAILED_RECOVERABLE` with the snapshot
 * documents untouched (`AppRepository.rollbackReplace` rethrows before the snapshot is
 * deleted). Nothing is defaulted or skipped silently.
 *
 * Two deliberate leniencies, because refusing them would block recovery for exactly the legacy
 * accounts the rules tolerate:
 *
 *  - values the *writer* itself produces are accepted — `amount: 0.0`, `dateMillis: 0` and
 *    `categoryId: "0"` are what `expenseFromDoc` normalizes an unreadable legacy row to;
 *  - fields the clients already truncate on write (`name` → 80, `iconName` → 63, `note` →
 *    2000) are accepted at length and truncated by the existing call site, rather than failing
 *    a rollback over a cosmetic field.
 *
 * Mirrors web/src/services/safetySnapshot.ts — keep both in sync.
 */
object SafetySnapshot {
    /** Bound on chunk documents a snapshot may reference, so a corrupt count cannot loop. */
    const val MAX_CHUNKS = 500
    /** Writer chunk size is 100 expenses (both clients) and 250 receipts (Android). */
    const val MAX_ROWS_PER_CHUNK = 500

    private val TRANSACTION_TYPES = setOf("expense", "income", "transfer")
    private val CURRENCIES = setOf("EUR", "USD", "GBP", "CHF")
    private val LOCALES = setOf("en", "de")
    private val THEME_MODES = setOf(
        "light", "dark", "system", "amoled", "midnight",
        "ocean", "forest", "sunset", "lavender", "soft_light",
    )
    private val ANALYTICS_PERIODS = setOf("all_time", "this_month", "last_month")
    private val MONTH_KEY = Regex("^month:[0-9]{4}-(0[1-9]|1[0-2])$")
    private val HEX_64 = Regex("^[0-9a-f]{64}$")

    /** One expense chunk row plus the legacy fields the rollback must write back with it. */
    data class ExpenseRow(val expense: Expense, val legacy: Map<String, Any>)

    class InvalidSnapshotException(val path: String, val reason: String) :
        IllegalStateException("SNAPSHOT_INVALID: $path: $reason")

    private fun fail(path: String, reason: String): Nothing = throw InvalidSnapshotException(path, reason)

    // ── primitive readers ──────────────────────────────────────────────────────────────

    private fun asRow(value: Any?, path: String): Map<String, Any?> = when (value) {
        is Map<*, *> -> value.entries
            .filter { it.key is String }
            .associate { it.key as String to it.value }
        null -> fail(path, "missing")
        else -> fail(path, "expected an object, got ${value::class.simpleName}")
    }

    private fun asRows(value: Any?, path: String): List<Map<String, Any?>> = when (value) {
        null -> emptyList()
        is List<*> -> {
            if (value.size > MAX_ROWS_PER_CHUNK) fail(path, "more than $MAX_ROWS_PER_CHUNK rows")
            value.mapIndexed { index, element -> asRow(element, "$path[$index]") }
        }
        else -> fail(path, "expected an array, got ${value::class.simpleName}")
    }

    private fun text(
        source: Map<String, Any?>,
        key: String,
        path: String,
        allowBlank: Boolean = false,
        max: Int = 2_000,
    ): String {
        val value = source[key] ?: fail("$path.$key", "missing")
        if (value !is String) fail("$path.$key", "expected a string, got ${value::class.simpleName}")
        if (!allowBlank && value.isBlank()) fail("$path.$key", "blank")
        if (value.length > max) fail("$path.$key", "longer than $max characters")
        return value
    }

    private fun num(source: Map<String, Any?>, key: String, path: String, allowAbsent: Boolean = false): Double {
        if (allowAbsent && source[key] == null) return 0.0
        val value = source[key] ?: fail("$path.$key", "missing")
        if (value !is Number) fail("$path.$key", "expected a number, got ${value::class.simpleName}")
        val asDouble = value.toDouble()
        if (!asDouble.isFinite()) fail("$path.$key", "not finite")
        return asDouble
    }

    private fun whole(source: Map<String, Any?>, key: String, path: String): Long {
        val asDouble = num(source, key, path)
        val asLong = asDouble.toLong()
        if (asLong.toDouble() != asDouble) fail("$path.$key", "not an integer")
        return asLong
    }

    private fun int(source: Map<String, Any?>, key: String, path: String): Int {
        val asLong = whole(source, key, path)
        if (asLong !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) fail("$path.$key", "outside 32-bit range")
        return asLong.toInt()
    }

    private fun intIn(source: Map<String, Any?>, key: String, path: String, range: IntRange): Int {
        val value = int(source, key, path)
        if (value !in range) fail("$path.$key", "outside ${range.first}..${range.last}")
        return value
    }

    private fun flag(source: Map<String, Any?>, key: String, path: String, default: Boolean): Boolean {
        val value = source[key] ?: return default
        if (value !is Boolean) fail("$path.$key", "expected a boolean, got ${value::class.simpleName}")
        return value
    }

    private fun choice(
        source: Map<String, Any?>,
        key: String,
        path: String,
        allowed: Set<String>,
        fallback: String?,
    ): String {
        if (source[key] == null) return fallback ?: fail("$path.$key", "missing")
        val value = text(source, key, path, max = 64)
        if (value !in allowed) fail("$path.$key", "unsupported value \"$value\"")
        return value
    }

    // ── sections ──────────────────────────────────────────────────────────────────────

    fun operationId(meta: Map<String, Any?>, path: String = "meta"): String = text(meta, "operationId", path, max = 64)

    /** Declared chunk count, bounded so a corrupt value cannot drive an unbounded read loop. */
    fun chunkCount(meta: Map<String, Any?>, key: String, path: String = "meta", default: Int = 1): Int {
        if (meta[key] == null) return default
        val count = int(meta, key, path)
        if (count !in 0..MAX_CHUNKS) fail("$path.$key", "outside 0..$MAX_CHUNKS")
        return count
    }

    fun categories(meta: Map<String, Any?>, path: String = "meta"): List<Category> =
        asRows(meta["categories"], "$path.categories").mapIndexed { index, c ->
            val rowPath = "$path.categories[$index]"
            Category(
                id = text(c, "id", rowPath, max = 64),
                // Truncated by the rollback writer, like every other category writer.
                name = text(c, "name", rowPath, max = 512),
                iconName = text(c, "iconName", rowPath, allowBlank = true, max = 512)
                    .ifBlank { "shopping_bag" },
                colorInt = int(c, "colorInt", rowPath),
                transactionType = choice(c, "transactionType", rowPath, TRANSACTION_TYPES, "expense"),
                sortOrder = intIn(c, "sortOrder", rowPath, 0..9_999),
            )
        }

    fun expenses(
        chunk: Map<String, Any?>,
        path: String,
        legacyOf: (Map<String, Any?>) -> Map<String, Any>,
    ): List<ExpenseRow> = asRows(chunk["expenses"], "$path.expenses").mapIndexed { index, e ->
        val rowPath = "$path.expenses[$index]"
        val amount = num(e, "amount", rowPath)
        // 0.0 is what the writer records for an unreadable legacy row; a negative or
        // over-cap amount is not something any writer can produce.
        if (amount < 0.0 || amount >= 1_000_000_000.0) fail("$rowPath.amount", "outside 0..1e9")
        ExpenseRow(
            expense = Expense(
                id = text(e, "id", rowPath, max = 64),
                amount = amount,
                dateMillis = whole(e, "dateMillis", rowPath),
                categoryId = text(e, "categoryId", rowPath, max = 63),
                note = text(e, "note", rowPath, allowBlank = true, max = 100_000),
                transactionType = choice(e, "transactionType", rowPath, TRANSACTION_TYPES, "expense"),
                deleted = flag(e, "deleted", rowPath, false),
            ),
            legacy = legacyOf(e),
        )
    }

    fun budgets(meta: Map<String, Any?>, path: String = "meta"): List<CategoryBudget>? {
        if (meta["categoryBudgets"] == null) return null
        return asRows(meta["categoryBudgets"], "$path.categoryBudgets").mapIndexed { index, b ->
            val rowPath = "$path.categoryBudgets[$index]"
            val budget = CategoryBudget(
                categoryId = text(b, "categoryId", rowPath, max = 63),
                monthlyLimit = num(b, "monthlyLimit", rowPath),
                warningThresholdPercent = intIn(b, "warningThresholdPercent", rowPath, 1..100),
                updatedAt = whole(b, "updatedAt", rowPath),
            )
            // Mirrors the rules and CategoryBudget.valid(), so a rollback write cannot be
            // rejected half-way through the collection.
            if (!budget.valid()) fail(rowPath, "budget for \"${budget.categoryId}\" is not writable")
            budget
        }
    }

    fun templates(meta: Map<String, Any?>, path: String = "meta"): List<RecurringTemplate>? {
        if (meta["recurringTemplates"] == null) return null
        // Dropping an invalid template here would delete it on rollback; refuse instead.
        return asRows(meta["recurringTemplates"], "$path.recurringTemplates").mapIndexed { index, t ->
            val rowPath = "$path.recurringTemplates[$index]"
            val id = text(t, "id", rowPath, max = 64)
            val template = try {
                RecurringTemplate.from(id, t)
            } catch (e: Exception) {
                fail(rowPath, "template \"$id\" is unreadable (${e.message})")
            }
            if (!template.valid()) fail(rowPath, "template \"$id\" is not writable")
            template
        }
    }

    fun receipts(value: Any?, path: String): List<OccurrenceReceipt> =
        asRows(value, path).mapIndexed { index, r ->
            val rowPath = "$path[$index]"
            val id = text(r, "id", rowPath, max = 256)
            val templateId = text(r, "templateId", rowPath, max = 64)
            val scheduledDate = text(r, "scheduledDate", rowPath, max = 32)
            val expenseId = text(r, "expenseId", rowPath, max = 64)
            val createdAt = whole(r, "createdAt", rowPath)
            // Exactly the shape firestore.rules requires of an occurrence receipt.
            if (id != "${templateId}_$scheduledDate") fail("$rowPath.id", "does not encode template and date")
            if (!HEX_64.matches(expenseId)) fail("$rowPath.expenseId", "expected a lowercase SHA-256 hex id")
            if (createdAt <= 0L) fail("$rowPath.createdAt", "not positive")
            OccurrenceReceipt(id, templateId, scheduledDate, expenseId, createdAt)
        }

    fun preferences(meta: Map<String, Any?>, path: String = "meta"): SyncedPreferences? {
        val raw = meta["preferences"] ?: return null
        val prefs = asRow(raw, "$path.preferences")
        if (prefs.isEmpty()) return null
        val prefsPath = "$path.preferences"
        val monthlyBudget = if (prefs["monthlyBudget"] == null) null else num(prefs, "monthlyBudget", prefsPath)
        if (monthlyBudget != null && (monthlyBudget < 0.0 || monthlyBudget >= 1_000_000_000.0)) {
            fail("$prefsPath.monthlyBudget", "outside 0..1e9")
        }
        val analytics = if (prefs["analyticsPeriod"] == null) {
            "this_month"
        } else {
            val value = text(prefs, "analyticsPeriod", prefsPath, max = 64)
            if (value !in ANALYTICS_PERIODS && !MONTH_KEY.matches(value)) {
                fail("$prefsPath.analyticsPeriod", "unsupported value \"$value\"")
            }
            value
        }
        return SyncedPreferences(
            currency = choice(prefs, "currency", prefsPath, CURRENCIES, "EUR"),
            locale = choice(prefs, "locale", prefsPath, LOCALES, "en"),
            themeMode = choice(prefs, "themeMode", prefsPath, THEME_MODES, "system"),
            onboardingComplete = flag(prefs, "onboardingComplete", prefsPath, true),
            dailyReminder = flag(prefs, "dailyReminder", prefsPath, true),
            reminderHour = if (prefs["reminderHour"] == null) 19 else intIn(prefs, "reminderHour", prefsPath, 0..23),
            reminderMinute = if (prefs["reminderMinute"] == null) 0 else intIn(prefs, "reminderMinute", prefsPath, 0..59),
            analyticsPeriod = analytics,
            monthlyBudget = monthlyBudget,
            updatedAt = if (prefs["updatedAt"] == null) System.currentTimeMillis() else whole(prefs, "updatedAt", prefsPath),
        )
    }

    /**
     * Cross-check a declared total against what was actually read.
     *
     * This is what turns "a chunk quietly yielded nothing" into a loud failure: the writer
     * records `totalExpenses`/`totalCategories`/`totalReceipts` in the snapshot metadata, so a
     * mismatch can only mean the payload was truncated, corrupted, or read wrongly. Absent
     * totals (a snapshot from a build that did not record them) are not checked.
     */
    fun requireCount(declared: Any?, actual: Int, path: String) {
        if (declared == null) return
        if (declared !is Number) fail(path, "declared count is not a number")
        val expected = declared.toDouble().toLong()
        if (expected != actual.toLong()) fail(path, "snapshot declares $expected rows but $actual were read")
    }

    /** Optional declared total, for callers that only want to forward it to [requireCount]. */
    fun declaredCount(meta: Map<String, Any?>, key: String, path: String = "meta"): Any? = meta[key]?.let {
        if (it !is Number) fail("$path.$key", "declared count is not a number")
        it
    }
}
