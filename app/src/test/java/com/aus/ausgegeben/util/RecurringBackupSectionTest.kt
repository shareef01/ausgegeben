package com.aus.ausgegeben.util
import org.junit.Test
import org.junit.Assert.*
class RecurringBackupSectionTest {
 private val receipt=OccurrenceReceipt("550e8400-e29b-41d4-a716-446655440000_2024-01-31","550e8400-e29b-41d4-a716-446655440000","2024-01-31","a".repeat(64),1)
 @Test fun roundTripRetainsReceiptsWithoutTemplates(){val section=RecurringBackupSection(emptyList(),listOf(receipt));assertEquals(section,RecurringBackupSection.parse(section.serialize()))}
 @Test fun rejectsMissingCollections(){assertTrue(runCatching {RecurringBackupSection.parse("{\"templates\":[]}")}.isFailure)}
 @Test fun rejectsDuplicateReceipts(){assertTrue(runCatching {RecurringBackupSection(emptyList(),listOf(receipt,receipt)).serialize()}.isFailure)}
 @Test fun rejectsAmbiguousReceiptPath(){assertTrue(runCatching {RecurringBackupSection(emptyList(),listOf(receipt.copy(id=receipt.id+"extra"))).serialize()}.isFailure)}
}
