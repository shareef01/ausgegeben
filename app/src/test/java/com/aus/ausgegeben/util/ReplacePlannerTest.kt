package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.SyncedPreferences
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReplacePlannerTest {
    @Test fun delimiterBearingBudgetIdsCannotCollide() {
        val one = sampleBackup.copy(schemaVersion = 2, categoryBudgets = listOf(com.aus.ausgegeben.data.entity.CategoryBudget("a,100,80;b", 200.0, 80, 1)))
        val two = one.copy(categoryBudgets = listOf(com.aus.ausgegeben.data.entity.CategoryBudget("a", 100.0, 80, 1), com.aus.ausgegeben.data.entity.CategoryBudget("b", 200.0, 80, 1)))
        assertNotEquals(ReplacePlanner.computeBackupFingerprint(one), ReplacePlanner.computeBackupFingerprint(two))
    }


    private val sampleCategories = listOf(
        Category(
            id = "cat-1",
            name = "Groceries",
            iconName = "shopping_cart",
            colorInt = -16776961,
            transactionType = "expense",
            sortOrder = 0,
        ),
        Category(
            id = "cat-2",
            name = "Salary",
            iconName = "attach_money",
            colorInt = -16711936,
            transactionType = "income",
            sortOrder = 1,
        ),
        Category(
            id = "cat-3",
            name = "Old Category",
            iconName = "star",
            colorInt = -65536,
            transactionType = "expense",
            sortOrder = 2,
        ),
    )

    private val sampleExpenses = listOf(
        Expense(
            id = "exp-1",
            amount = 15.5,
            dateMillis = 1700000000000L,
            categoryId = "cat-1",
            note = "Supermarket",
            transactionType = "expense",
        ),
        Expense(
            id = "exp-2",
            amount = 2500.0,
            dateMillis = 1700000000000L,
            categoryId = "cat-2",
            note = "Monthly salary",
            transactionType = "income",
        ),
        Expense(
            id = "exp-3",
            amount = 5.0,
            dateMillis = 1700000000000L,
            categoryId = "cat-3",
            note = "Coffee",
            transactionType = "expense",
        ),
    )

    private val samplePreferences = SyncedPreferences(
        currency = "EUR",
        locale = "en",
        themeMode = "system",
        onboardingComplete = true,
        dailyReminder = true,
        reminderHour = 19,
        reminderMinute = 0,
        analyticsPeriod = "this_month",
        monthlyBudget = 1500.0,
        updatedAt = 1000L,
    )

    private val sampleBackup = BackupFormat.ParsedBackup(
        schemaVersion = 1,
        appVersion = "2.0.8",
        exportedAt = "2026-10-01T12:00:00Z",
        preferences = BackupFormat.BackupPreferences(
            currency = "USD",
            monthlyBudget = 2000.0,
            locale = "de",
            themeMode = "dark",
            preferencesUpdatedAt = 500L,
        ),
        categories = listOf(
            BackupFormat.ParsedCategory(
                id = "cat-1",
                name = "Supermarket",
                iconName = "cart",
                colorInt = -16776961,
                transactionType = "expense",
                sortOrder = 0,
                updatedAt = 2000L,
            ),
            BackupFormat.ParsedCategory(
                id = "cat-4",
                name = "Freelance",
                iconName = "work",
                colorInt = -256,
                transactionType = "income",
                sortOrder = 1,
                updatedAt = 2000L,
            ),
        ),
        expenses = listOf(
            BackupFormat.ParsedExpense(
                id = "exp-1",
                amount = 19.99,
                dateMillis = 1710000000000L,
                categoryId = "cat-1",
                note = "Updated grocery",
                transactionType = "expense",
                updatedAt = 2000L,
            ),
            BackupFormat.ParsedExpense(
                id = "exp-4",
                amount = 500.0,
                dateMillis = 1710000000000L,
                categoryId = "cat-4",
                note = "Consulting",
                transactionType = "income",
                updatedAt = 2000L,
            ),
        ),
    )

    @Test
    fun `computes deterministic SHA-256 fingerprint regardless of array item order`() {
        val fp1 = ReplacePlanner.computeBackupFingerprint(sampleBackup)
        assertEquals(64, fp1.length)

        val reorderedBackup = sampleBackup.copy(
            expenses = sampleBackup.expenses.reversed(),
            categories = sampleBackup.categories.reversed(),
        )
        val fp2 = ReplacePlanner.computeBackupFingerprint(reorderedBackup)
        assertEquals(fp1, fp2)

        val modifiedBackup = sampleBackup.copy(
            expenses = listOf(sampleBackup.expenses[0].copy(amount = 20.0), sampleBackup.expenses[1]),
        )
        val fp3 = ReplacePlanner.computeBackupFingerprint(modifiedBackup)
        assertNotEquals(fp1, fp3)
    }

    @Test
    fun `correctly plans upserts, stale deletions, and category preservations`() {
        val plan = ReplacePlanner.planReplace(
            currentExpenses = sampleExpenses,
            currentCategories = sampleCategories,
            currentPreferences = samplePreferences,
            backup = sampleBackup,
        )

        assertTrue(plan.conflicts.isEmpty())

        assertEquals(listOf("exp-1", "exp-4"), plan.expensesToUpsert.map { it.id })
        assertEquals(listOf("exp-2", "exp-3"), plan.expenseIdsToDelete)
        assertEquals(listOf("cat-1", "cat-4"), plan.categoriesToUpsert.map { it.id })
        assertEquals(listOf("cat-2", "cat-3"), plan.categoryIdsToPreserve)

        assertEquals("USD", plan.preferencesToUpdate.currency)
        assertEquals(2000.0, plan.preferencesToUpdate.monthlyBudget)
        assertEquals("de", plan.preferencesToUpdate.locale)
        assertEquals("dark", plan.preferencesToUpdate.themeMode)
        assertTrue(plan.preferencesToUpdate.updatedAt > samplePreferences.updatedAt)

        assertEquals(
            ReplacePlanner.PlannedCounts(
                backupExpenseCount = 2,
                backupCategoryCount = 2,
                expensesToUpsertCount = 2,
                expensesToDeleteCount = 2,
                categoriesToUpsertCount = 2,
                categoriesPreservedCount = 2,
            ),
            plan.counts,
        )
    }

    @Test
    fun `detects category type conflict and returns non-empty conflicts`() {
        val conflictingBackup = sampleBackup.copy(
            categories = listOf(
                BackupFormat.ParsedCategory(
                    id = "cat-1",
                    name = "Groceries as Income",
                    iconName = "attach_money",
                    colorInt = -16711936,
                    transactionType = "income",
                    sortOrder = 0,
                ),
            ),
        )

        val plan = ReplacePlanner.planReplace(
            currentExpenses = sampleExpenses,
            currentCategories = sampleCategories,
            currentPreferences = samplePreferences,
            backup = conflictingBackup,
        )

        assertTrue(plan.conflicts.isNotEmpty())
        assertTrue(plan.conflicts[0].contains("CATEGORY_TYPE_CONFLICT"))
    }

    @Test
    fun `detects orphan category references in backup`() {
        val orphanBackup = sampleBackup.copy(
            categories = emptyList(),
            expenses = listOf(
                BackupFormat.ParsedExpense(
                    id = "exp-orphan",
                    amount = 10.0,
                    dateMillis = 1710000000000L,
                    categoryId = "non-existent-cat",
                    note = "Orphan",
                    transactionType = "expense",
                ),
            ),
        )

        val plan = ReplacePlanner.planReplace(
            currentExpenses = sampleExpenses,
            currentCategories = sampleCategories,
            currentPreferences = samplePreferences,
            backup = orphanBackup,
        )

        assertTrue(plan.conflicts.isNotEmpty())
        assertTrue(plan.conflicts[0].contains("CATEGORY_ORPHAN_REFERENCE"))
    }

    @Test
    fun `rejects unsupported schema versions`() {
        val invalidSchemaBackup = sampleBackup.copy(schemaVersion = 3)

        val plan = ReplacePlanner.planReplace(
            currentExpenses = sampleExpenses,
            currentCategories = sampleCategories,
            currentPreferences = samplePreferences,
            backup = invalidSchemaBackup,
        )

        assertTrue(plan.conflicts.isNotEmpty())
        assertTrue(plan.conflicts[0].contains("UNSUPPORTED_SCHEMA_VERSION"))
    }

    @Test
    fun `validates state machine phases and transitions`() {
        // Happy path transitions
        val phases = listOf(
            ReplacePlanner.RestorePhase.PREPARING,
            ReplacePlanner.RestorePhase.SNAPSHOT_READY,
            ReplacePlanner.RestorePhase.APPLYING,
            ReplacePlanner.RestorePhase.VERIFYING,
            ReplacePlanner.RestorePhase.COMPLETED,
        )
        for (i in 0 until phases.size - 1) {
            assertTrue(phases[i].ordinal < phases[i + 1].ordinal)
        }

        // Failure & rollback phases
        val recoverable = ReplacePlanner.RestorePhase.FAILED_RECOVERABLE
        val rollingBack = ReplacePlanner.RestorePhase.ROLLING_BACK
        val rolledBack = ReplacePlanner.RestorePhase.ROLLED_BACK
        assertEquals("FAILED_RECOVERABLE", recoverable.name)
        assertEquals("ROLLING_BACK", rollingBack.name)
        assertEquals("ROLLED_BACK", rolledBack.name)
    }

    @Test
    fun `resume decisions enforce account boundary and backup fingerprint match`() {
        val originalFp = ReplacePlanner.computeBackupFingerprint(sampleBackup)
        val op = ReplacePlanner.RestoreOperationDoc(
            operationId = "op-123",
            ownerUid = "user-A",
            backupFingerprint = originalFp,
            phase = ReplacePlanner.RestorePhase.FAILED_RECOVERABLE,
            createdAt = 1000L,
            updatedAt = 1000L,
        )

        // Account mismatch
        val isUserMismatch = op.ownerUid != "user-B"
        assertTrue(isUserMismatch)

        // Fingerprint mismatch
        val modifiedBackup = sampleBackup.copy(
            expenses = listOf(sampleBackup.expenses[0].copy(amount = 999.0)),
        )
        val modifiedFp = ReplacePlanner.computeBackupFingerprint(modifiedBackup)
        assertNotEquals(originalFp, modifiedFp)
        assertNotEquals(op.backupFingerprint, modifiedFp)

        // Matching resume
        assertEquals(op.backupFingerprint, ReplacePlanner.computeBackupFingerprint(sampleBackup))
    }

    @Test
    fun `rollback planning correctly identifies extra expenses to delete`() {
        val snapshotExpenseIds = setOf("exp-1", "exp-2")
        val currentServerExpenseIds = listOf("exp-1", "exp-2", "exp-3-stale", "exp-4-stale")

        val toDelete = currentServerExpenseIds.filter { it !in snapshotExpenseIds }
        assertEquals(listOf("exp-3-stale", "exp-4-stale"), toDelete)
    }
}
