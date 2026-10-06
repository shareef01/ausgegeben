package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.data.entity.Recurrence
import org.json.JSONObject
import org.json.JSONArray

data class OccurrenceReceipt(val id:String,val templateId:String,val scheduledDate:String,val expenseId:String,val createdAt:Long)
data class RecurringBackupSection(val templates:List<RecurringTemplate>,val receipts:List<OccurrenceReceipt>) {
    fun serialize():String {
        val json=JSONObject().put("templates",JSONArray(templates.map {JSONObject((it.payload()+("id" to it.id)).mapValues { (_, v) -> v ?: JSONObject.NULL })}))
            .put("receipts",JSONArray(receipts.map {JSONObject(mapOf("id" to it.id,"templateId" to it.templateId,"scheduledDate" to it.scheduledDate,"expenseId" to it.expenseId,"createdAt" to it.createdAt))}))
        parse(json.toString())
        return json.toString()
    }
    companion object {
        private val templateKeys="id amount categoryId note transactionType frequency interval startDate endDate timeZone enabled nextIndex nextDate createdAt updatedAt".split(" ").toSet()
        private val receiptKeys="id templateId scheduledDate expenseId createdAt".split(" ").toSet()
        private fun exact(json:JSONObject,keys:Set<String>) { require(json.keys().asSequence().toSet()==keys) {"INVALID_RECURRING_SECTION"} }
        private fun integer(json:JSONObject,key:String):Long {val value=json.get(key) as Number;val n=value.toLong();require(value.toDouble()==n.toDouble()&&n in 0..9_007_199_254_740_991L);return n}
        /** Standalone representation; published backup schema integration waits for PR #53. */
        fun parse(value:String):RecurringBackupSection {
            val json=JSONObject(value);exact(json,setOf("templates","receipts"))
            val t=json.getJSONArray("templates");val templates=(0 until t.length()).map {i->
                val d=t.getJSONObject(i);exact(d,templateKeys)
                for(key in listOf("interval","nextIndex","createdAt","updatedAt")) integer(d,key)
                require(integer(d,"interval") in 1..365 && integer(d,"nextIndex") in 0..40000)
                val fields=d.keys().asSequence().associateWith {key->d.get(key).takeUnless {it==JSONObject.NULL}}
                RecurringTemplate.from(d.getString("id"),fields).also {require(it.valid())}
            }
            require(templates.map{it.id}.toSet().size==templates.size)
            val r=json.getJSONArray("receipts");val receipts=(0 until r.length()).map {i->
                val d=r.getJSONObject(i);exact(d,receiptKeys)
                val receipt=OccurrenceReceipt(d.getString("id"),d.getString("templateId"),d.getString("scheduledDate"),d.getString("expenseId"),integer(d,"createdAt"))
                require(receipt.createdAt>0&&receipt.expenseId.matches(Regex("[0-9a-f]{64}"))&&receipt.id==Recurrence.receiptId(receipt.templateId,receipt.scheduledDate));receipt
            }
            require(receipts.map{it.id}.toSet().size==receipts.size)
            return RecurringBackupSection(templates,receipts)
        }
    }
}
