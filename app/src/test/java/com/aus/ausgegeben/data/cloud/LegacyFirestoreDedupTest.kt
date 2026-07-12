package com.aus.ausgegeben.data.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyFirestoreDedupTest {

    @Test
    fun isLegacyFirestoreDocId_detectsNumericIds() {
        assertTrue(isLegacyFirestoreDocId("5"))
        assertTrue(isLegacyFirestoreDocId("123"))
    }

    @Test
    fun dedupeLegacyCategoryDocs_dropsDuplicateLegacyDoc() {
        val modern = CloudCategoryRecord(
            id = 0L,
            cloudId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            name = "Food",
            iconName = "shopping_bag",
            colorInt = 1,
            transactionType = "expense",
            sortOrder = 0,
            updatedAt = 10L,
        )
        val legacy = modern.copy(cloudId = "5", updatedAt = 8L)

        val result = dedupeLegacyCategoryDocs(
            listOf(
                FirestorePulledDoc(modern.cloudId, modern),
                FirestorePulledDoc("5", legacy),
            ),
        )

        assertEquals(1, result.records.size)
        assertEquals(modern.cloudId, result.records.first().cloudId)
        assertEquals(listOf("5"), result.legacyDocIdsToDelete)
    }

    @Test
    fun dedupeLegacyExpenseDocs_collapsesTwoModernDuplicates() {
        val canonical = CloudExpenseRecord(
            id = 0L,
            cloudId = "a0000000-0000-4000-8000-000000000000",
            amount = 25.83,
            dateMillis = 1_700_000_000_000L,
            categoryId = 0L,
            categoryCloudId = "cat",
            note = "edeka",
            receiptImagePath = null,
            transactionType = "expense",
            updatedAt = 10L,
        )
        val duplicate = canonical.copy(cloudId = "f0000000-0000-4000-8000-000000000000", updatedAt = 12L)

        val result = dedupeLegacyExpenseDocs(
            listOf(
                FirestorePulledDoc(duplicate.cloudId, duplicate),
                FirestorePulledDoc(canonical.cloudId, canonical),
            ),
        )

        assertEquals(1, result.records.size)
        assertEquals(canonical.cloudId, result.records.first().cloudId)
        assertEquals(listOf(duplicate.cloudId), result.duplicateCloudIds)
        assertTrue(result.legacyDocIdsToDelete.isEmpty())
    }

    @Test
    fun dedupeLegacyExpenseDocs_keepsDistinctExpenses() {
        val first = CloudExpenseRecord(
            id = 0L,
            cloudId = "a0000000-0000-4000-8000-000000000000",
            amount = 3.0,
            dateMillis = 1_700_000_000_000L,
            categoryId = 0L,
            categoryCloudId = "cat",
            note = "coffee",
            receiptImagePath = null,
            transactionType = "expense",
            updatedAt = 10L,
        )
        val second = first.copy(cloudId = "b0000000-0000-4000-8000-000000000000", dateMillis = 1_700_000_050_000L)

        val result = dedupeLegacyExpenseDocs(
            listOf(
                FirestorePulledDoc(first.cloudId, first),
                FirestorePulledDoc(second.cloudId, second),
            ),
        )

        assertEquals(2, result.records.size)
        assertTrue(result.duplicateCloudIds.isEmpty())
    }

    @Test
    fun dedupeLegacyCategoryDocs_keepsLegacyOnlyDocs() {
        val legacy = CloudCategoryRecord(
            id = 0L,
            cloudId = "3",
            name = "Travel",
            iconName = "flight",
            colorInt = 2,
            transactionType = "expense",
            sortOrder = 1,
            updatedAt = 5L,
        )

        val result = dedupeLegacyCategoryDocs(listOf(FirestorePulledDoc("3", legacy)))

        assertEquals(1, result.records.size)
        assertTrue(result.legacyDocIdsToDelete.isEmpty())
    }
}
