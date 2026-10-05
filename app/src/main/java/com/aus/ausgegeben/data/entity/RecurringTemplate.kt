package com.aus.ausgegeben.data.entity

import java.time.LocalDate
import java.time.ZoneId
import java.time.Instant
import java.time.temporal.ChronoUnit
import org.json.JSONArray
import kotlin.math.abs
import kotlin.math.round

data class RecurringTemplate(
    val id: String, val amount: Double, val categoryId: String, val note: String, val transactionType: String,
    val frequency: String, val interval: Int, val startDate: String, val endDate: String?, val timeZone: String,
    val enabled: Boolean, val nextIndex: Int, val nextDate: String?, val createdAt: Long, val updatedAt: Long,
) {
    fun valid(): Boolean = runCatching {
        ZoneId.of(timeZone)
        id.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) && categoryId.isNotEmpty() && categoryId.length < 64 && '/' !in categoryId && note.length <= 2000 &&
            transactionType in listOf("expense", "income", "transfer") && frequency in listOf("daily", "weekly", "monthly", "yearly") && interval in 1..365 &&
            amount.isFinite() && amount > 0 && amount < 1e9 && abs(amount * 100 - round(amount * 100)) < .0001 && Recurrence.validDate(startDate) &&
            Recurrence.millis(startDate,timeZone) in 946684800000L until 4102444800000L &&
            (endDate == null || Recurrence.validDate(endDate) && endDate >= startDate) && nextIndex in 0..40000 && nextDate == Recurrence.date(this, nextIndex) &&
            createdAt in 1..9_007_199_254_740_991L && updatedAt in createdAt..9_007_199_254_740_991L
    }.getOrDefault(false)
    fun payload(): Map<String, Any?> = mapOf("amount" to amount, "categoryId" to categoryId, "note" to note, "transactionType" to transactionType,
        "frequency" to frequency, "interval" to interval, "startDate" to startDate, "endDate" to endDate, "timeZone" to timeZone,
        "enabled" to enabled, "nextIndex" to nextIndex, "nextDate" to nextDate, "createdAt" to createdAt, "updatedAt" to updatedAt)
    companion object {
        fun from(id: String, d: Map<String, Any?>) = RecurringTemplate(id,(d["amount"] as Number).toDouble(),d["categoryId"] as String,d["note"] as String,d["transactionType"] as String,
            d["frequency"] as String,(d["interval"] as Number).toInt(),d["startDate"] as String,d["endDate"] as String?,d["timeZone"] as String,d["enabled"] as Boolean,
            (d["nextIndex"] as Number).toInt(),d["nextDate"] as String?,(d["createdAt"] as Number).toLong(),(d["updatedAt"] as Number).toLong())
    }
}
object Recurrence {
    const val MAX_PER_PASS = 20
    fun validDate(value: String) = runCatching { value.matches(Regex("20[0-9]{2}-[0-9]{2}-[0-9]{2}")) && LocalDate.parse(value).toString() == value }.getOrDefault(false)
    fun date(t: RecurringTemplate, index: Int): String? {
        if (index !in 0..40000 || t.interval !in 1..365) return null
        val anchor = LocalDate.parse(t.startDate)
        val step = index.toLong() * t.interval
        val result = when(t.frequency) { "daily" -> anchor.plusDays(step); "weekly" -> anchor.plusWeeks(step); "monthly" -> anchor.plusMonths(step); "yearly" -> anchor.plusYears(step); else -> return null }.toString()
        return result.takeIf { validDate(it) && (t.endDate == null || it <= t.endDate) && millis(it,t.timeZone) in 946684800000L until 4102444800000L }
    }
    fun localDate(millis: Long, zone: String) = Instant.ofEpochMilli(millis).atZone(ZoneId.of(zone)).toLocalDate().toString()
    fun millis(date: String, zone: String) = LocalDate.parse(date).atStartOfDay(ZoneId.of(zone)).toInstant().toEpochMilli()
    fun indexAfter(t: RecurringTemplate, day: String): Int {
        val a=LocalDate.parse(t.startDate); val b=LocalDate.parse(day)
        val units=when(t.frequency) { "yearly" -> b.year-a.year; "monthly" -> (b.year-a.year)*12+b.monthValue-a.monthValue; "weekly" -> ChronoUnit.DAYS.between(a,b).toInt()/7; else -> ChronoUnit.DAYS.between(a,b).toInt() }
        var index=maxOf(0,units/t.interval)
        while (date(t,index)?.let { it <= day } == true) index++
        return index
    }
    fun key(id: String, date: String): String {
        require(id.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) && validDate(date))
        return JSONArray(listOf("recurring-v1",id,date)).toString()
    }
    fun dueDates(t: RecurringTemplate, now: Long, limit: Int = MAX_PER_PASS): List<String> {
        if(!t.valid() || !t.enabled) return emptyList()
        val today=localDate(now,t.timeZone); val result=mutableListOf<String>(); var index=t.nextIndex
        while(result.size < limit.coerceIn(0,MAX_PER_PASS)) { val day=date(t,index++) ?: break; if(day>today) break; result.add(day) }
        return result
    }
    fun receiptId(id: String, date: String): String { key(id,date); return "${id}_$date" }
}
