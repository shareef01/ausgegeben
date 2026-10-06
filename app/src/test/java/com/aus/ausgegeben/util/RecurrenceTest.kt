package com.aus.ausgegeben.util
import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.data.entity.Recurrence
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONArray
import java.io.File

class RecurrenceTest {
 private val template=RecurringTemplate("550e8400-e29b-41d4-a716-446655440000",15.0,"rent","","expense","monthly",1,"2024-01-31",null,"Europe/Berlin",true,0,"2024-01-31",1,1)
 @Test fun sharedCalendarAndIdentityFixtures() {
  val file=listOf(File("../fixtures/recurrence.json"),File("fixtures/recurrence.json")).first{it.exists()}
  val fixtures=JSONArray(file.readText())
  for(i in 0 until fixtures.length()){
   val f=fixtures.getJSONObject(i); val t=template.copy(frequency=f.getString("frequency"),interval=f.getInt("interval"),startDate=f.getString("startDate"));val dates=f.getJSONArray("dates")
   for(j in 0 until dates.length())assertEquals(dates.getString(j),Recurrence.date(t,j))
   assertEquals(f.getString("key"),Recurrence.key(t.id,dates.getString(1)))
   assertEquals(f.getString("expenseId"),expenseDocumentId(f.getString("key")))
  }
 }
 @Test fun monthlyAnchorsReturnAfterFebruary(){for(day in listOf(1,28,29,30,31)){val t=template.copy(startDate="2023-01-%02d".format(day));assertEquals("2023-02-%02d".format(minOf(day,28)),Recurrence.date(t,1));assertEquals("2023-03-%02d".format(day),Recurrence.date(t,2))}}
 @Test fun bothDstTransitionsUseCalendarDays(){for((date,instant) in listOf("2024-03-31" to "2024-03-30T23:00:00Z","2024-04-01" to "2024-03-31T22:00:00Z","2024-10-27" to "2024-10-26T22:00:00Z","2024-10-28" to "2024-10-27T23:00:00Z"))assertEquals(java.time.Instant.parse(instant).toEpochMilli(),Recurrence.millis(date,"Europe/Berlin"))}
 @Test fun skippedDayUsesNextValidInstant(){assertEquals(java.time.Instant.parse("2011-12-30T10:00:00Z").toEpochMilli(),Recurrence.millis("2011-12-30","Pacific/Apia"))}
 @Test fun endDateIsInclusive(){val t=template.copy(endDate="2024-02-29");assertEquals("2024-02-29",Recurrence.date(t,1));assertNull(Recurrence.date(t,2))}
 @Test fun editAndResumeAreStrictlyFuture(){assertEquals(3,Recurrence.indexAfter(template,"2024-03-31"));assertEquals(0,Recurrence.indexAfter(template,"2023-01-01"))}
 @Test fun boundedCatchUpPausedAndFuture(){val now=java.time.Instant.parse("2024-04-10T12:00:00Z").toEpochMilli();assertEquals(listOf("2024-01-31","2024-02-29","2024-03-31"),Recurrence.dueDates(template,now));assertEquals(20,Recurrence.dueDates(template.copy(frequency="daily"),now).size);assertTrue(Recurrence.dueDates(template.copy(enabled=false),now).isEmpty());assertTrue(Recurrence.dueDates(template,0).isEmpty())}
 @Test fun invalidScheduleBounds(){assertFalse(template.copy(interval=0).valid());assertFalse(template.copy(amount=0.001).valid());assertFalse(template.copy(timeZone="bad/zone").valid());assertNull(Recurrence.date(template.copy(frequency="yearly",interval=365),40000))}
}
