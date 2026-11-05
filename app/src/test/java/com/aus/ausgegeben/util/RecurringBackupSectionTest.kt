package com.aus.ausgegeben.util
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
class RecurringBackupSectionTest {
 private val receipt=OccurrenceReceipt("550e8400-e29b-41d4-a716-446655440000_2024-01-31","550e8400-e29b-41d4-a716-446655440000","2024-01-31","15634124eab0e61b1e96e3bcc40968a8bfdce35bd2ee44f76fabdc3ab77e78f4",1)
 @Test fun roundTripRetainsReceiptsWithoutTemplates(){val section=RecurringBackupSection(emptyList(),listOf(receipt));assertEquals(section,RecurringBackupSection.parse(section.serialize()))}
 @Test fun rejectsMissingCollections(){assertTrue(runCatching {RecurringBackupSection.parse("{\"templates\":[]}")}.isFailure)}
 @Test fun rejectsDuplicateReceipts(){assertTrue(runCatching {RecurringBackupSection(emptyList(),listOf(receipt,receipt)).serialize()}.isFailure)}
 @Test fun rejectsAmbiguousReceiptPath(){assertTrue(runCatching {RecurringBackupSection(emptyList(),listOf(receipt.copy(id=receipt.id+"extra"))).serialize()}.isFailure)}
 /** Shared with web recurringBackupSection.test.ts: a restore may write a receipt only if parse accepts it. */
 private val restoreCases:JSONArray=JSONObject(listOf(File("../testdata/receipt-restore.json"),File("testdata/receipt-restore.json")).first{it.exists()}.readText()).getJSONArray("cases")
 private fun section(vararg receipts:JSONObject)=JSONObject().put("templates",JSONArray()).put("receipts",JSONArray(receipts.toList())).toString()
 @Test fun sharedRestoreFixtureCoversMismatches(){val accepted=(0 until restoreCases.length()).count{restoreCases.getJSONObject(it).getBoolean("accepted")};assertTrue(accepted>0);assertTrue(restoreCases.length()-accepted>=4)}
 @Test fun everySharedRestoreCaseIsAcceptedOrRejectedLikeWeb(){
  for(i in 0 until restoreCases.length()){val c=restoreCases.getJSONObject(i)
   assertEquals(c.getString("name"),c.getBoolean("accepted"),runCatching{RecurringBackupSection.parse(section(c.getJSONObject("receipt")))}.isSuccess)}
 }
 @Test fun oneMismatchedReceiptRejectsTheWholeSectionAndIsNamed(){
  val good=(0 until restoreCases.length()).map{restoreCases.getJSONObject(it)}.first{it.getBoolean("accepted")}.getJSONObject("receipt")
  // Same template, next day, but carrying the first day's expense id: id is well formed, identity is not.
  val date="2024-02-01";val bad=JSONObject(good.toString()).put("scheduledDate",date).put("id",good.getString("templateId")+"_"+date)
  val error=runCatching{RecurringBackupSection.parse(section(good,bad))}.exceptionOrNull()
  assertTrue(error is IllegalArgumentException);assertTrue(error!!.message!!.startsWith("INVALID_RECURRING_SECTION"))
  assertTrue(error.message!!.contains(bad.getString("id")));assertFalse(error.message!!.contains(good.getString("id")))
 }
 @Test fun requireIdentitiesRejectsAMismatchedReceipt(){
  assertTrue(runCatching{OccurrenceReceipt.requireIdentities(listOf(receipt.copy(expenseId="b".repeat(64))))}.isFailure)
  OccurrenceReceipt.requireIdentities(listOf(receipt))
 }
 @Test fun exportStaysStructuralSoALegacyMismatchedReceiptCanStillBeBackedUp(){
  val legacy=receipt.copy(expenseId="b".repeat(64))
  val json=RecurringBackupSection(emptyList(),listOf(legacy)).serialize()
  assertTrue(runCatching{RecurringBackupSection.parse(json)}.isFailure)
  assertEquals(listOf(legacy),RecurringBackupSection.parse(json,requireIdentity=false).receipts)
 }
}
