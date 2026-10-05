package com.aus.ausgegeben.data

import com.aus.ausgegeben.data.auth.AuthRepository
import com.aus.ausgegeben.data.entity.RecurringTemplate
import com.aus.ausgegeben.data.entity.Recurrence
import com.aus.ausgegeben.util.expenseDocumentId
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.MetadataChanges
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecurringRepository @Inject constructor(private val client: FirestoreClient, private val auth: AuthRepository) {
    private val db get() = client.get()
    val uid get() = auth.currentUserId
    private fun owned(u: String) { check(uid == u) { "AUTH_ACCOUNT_CHANGED" }; check(auth.currentUser?.isEmailVerified == true) { "EMAIL_NOT_VERIFIED" } }
    private fun templates(u: String) = db.collection("users").document(u).collection(FirestorePaths.RECURRING_COLLECTION)
    private fun category(u: String, id: String) = db.collection("users").document(u).collection("categories").document(id)
    private fun eligible(d: Map<String,Any>?, type: String) { check(d != null && d["transactionType"] == type && d["deletionState"] != "deleting" && d["migrationState"] != "migrating") { "RECURRING_CATEGORY_UNAVAILABLE" } }
    data class Snapshot(val owner: String?, val rows: List<RecurringTemplate> = emptyList(), val incomplete: Boolean = true, val error: Boolean = false)
    fun observe(u: String) = callbackFlow {
        val alive=java.util.concurrent.atomic.AtomicBoolean(true)
        val subscription=templates(u).addSnapshotListener(MetadataChanges.INCLUDE) { snap, error ->
            if (alive.get() && uid == u) {
                val rows=runCatching { snap?.documents?.map { RecurringTemplate.from(it.id,it.data!!) } ?: emptyList() }
                trySend(Snapshot(u, rows.getOrDefault(emptyList()), snap?.metadata?.isFromCache ?: true, error != null || rows.isFailure))
            }
        }
        awaitClose { alive.set(false); subscription.remove() }
    }
    suspend fun getAll(u: String): List<RecurringTemplate> { owned(u); val snap=templates(u).get(Source.SERVER).await(); owned(u); return snap.documents.map { RecurringTemplate.from(it.id,it.data!!) } }
    suspend fun save(u: String, template: RecurringTemplate, expectedAt: Long?, now: Long = System.currentTimeMillis()) {
        owned(u); require(template.valid()) { "INVALID_RECURRING_TEMPLATE" }
        val target=templates(u).document(template.id); target.get(Source.SERVER).await()
        db.runTransaction { tx ->
            owned(u); val old=tx.get(target); val previous=if(old.exists()) RecurringTemplate.from(old.id,old.data!!) else null
            check(previous?.updatedAt == expectedAt) { "RECURRING_CONFLICT" }
            check(previous == null || previous.timeZone == template.timeZone) { "RECURRING_TIMEZONE_IMMUTABLE" }
            val newCategory=category(u,template.categoryId); val newCat=tx.get(newCategory); eligible(newCat.data,template.transactionType)
            val oldCategory=previous?.takeIf { it.categoryId != template.categoryId }?.let { category(u,it.categoryId) }
            val oldCat=oldCategory?.let { tx.get(it) }
            var next=template
            if(previous != null) {
                val pauseOnly=previous.enabled && !template.enabled && previous.copy(enabled=false,updatedAt=template.updatedAt) == template
                val index=if(pauseOnly) previous.nextIndex else Recurrence.indexAfter(template,Recurrence.localDate(now,template.timeZone))
                next=template.copy(nextIndex=index,nextDate=Recurrence.date(template,index),createdAt=previous.createdAt)
            }
            owned(u)
            if(previous == null || previous.categoryId != template.categoryId) tx.update(newCategory,mapOf("recurringTemplateCount" to ((newCat.getLong("recurringTemplateCount") ?: 0)+1),"recurringMutationId" to template.id))
            if(oldCategory != null) tx.update(oldCategory,mapOf("recurringTemplateCount" to maxOf(0,(oldCat!!.getLong("recurringTemplateCount") ?: 0)-1),"recurringMutationId" to template.id))
            tx.set(target,next.copy(updatedAt=maxOf(now,(previous?.updatedAt ?: 0)+1)).payload()); Unit
        }.await()
    }
    suspend fun remove(u: String, id: String, expectedAt: Long) {
        owned(u); val target=templates(u).document(id); target.get(Source.SERVER).await()
        db.runTransaction { tx ->
            owned(u); val old=tx.get(target); check(old.exists() && old.getLong("updatedAt") == expectedAt) { "RECURRING_CONFLICT" }
            val cat=category(u,old.getString("categoryId")!!); val snapshot=tx.get(cat); owned(u)
            tx.update(cat,mapOf("recurringTemplateCount" to maxOf(0,(snapshot.getLong("recurringTemplateCount") ?: 0)-1),"recurringMutationId" to id)); tx.delete(target); Unit
        }.await()
    }
    suspend fun materialize(u: String, id: String, now: Long = System.currentTimeMillis()): RecurringTemplate? {
        owned(u); val target=templates(u).document(id); target.get(Source.SERVER).await()
        var attemptedDate: String?=null; var attemptedRevision=0L
        try { return db.runTransaction { tx ->
            owned(u); val snap=tx.get(target); if(!snap.exists()) return@runTransaction null
            val template=RecurringTemplate.from(id,snap.data!!); require(template.valid()) { "INVALID_RECURRING_TEMPLATE" }
            val date=template.nextDate
            if(!template.enabled || date == null || date > Recurrence.localDate(now,template.timeZone)) return@runTransaction null
            attemptedDate=date; attemptedRevision=template.updatedAt
            val key=Recurrence.key(id,date); val expenseId=expenseDocumentId(key)
            val receipt=db.collection("users").document(u).collection(FirestorePaths.OCCURRENCES_COLLECTION).document(Recurrence.receiptId(id,date))
            val expense=db.collection("users").document(u).collection("expenses").document(expenseId)
            val receiptSnap=tx.get(receipt); val existing=tx.get(expense); val cat=tx.get(category(u,template.categoryId)); eligible(cat.data,template.transactionType); owned(u)
            check(!existing.exists() || existing.getString("idempotencyKey")==key) { "RECURRING_IDENTITY_CONFLICT" }
            if(!receiptSnap.exists()) {
                if(!existing.exists()) tx.set(expense,mapOf("amount" to template.amount,"categoryId" to template.categoryId,"note" to template.note.trim().take(2000),"transactionType" to template.transactionType,"dateMillis" to Recurrence.millis(date,template.timeZone),"updatedAt" to now,"idempotencyKey" to key))
                tx.set(receipt,mapOf("templateId" to id,"scheduledDate" to date,"expenseId" to expenseId,"createdAt" to now))
            }
            val index=template.nextIndex+1; val next=template.copy(nextIndex=index,nextDate=Recurrence.date(template,index),updatedAt=maxOf(now,template.updatedAt+1))
            tx.update(target,mapOf("nextIndex" to next.nextIndex,"nextDate" to next.nextDate,"updatedAt" to next.updatedAt)); next
        }.await() } catch(error: com.google.firebase.firestore.FirebaseFirestoreException) {
            val date=attemptedDate
            if(date!=null && error.code==com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                owned(u)
                val fresh=target.get(Source.SERVER).await()
                val receipt=db.collection("users").document(u).collection(FirestorePaths.OCCURRENCES_COLLECTION).document(Recurrence.receiptId(id,date)).get(Source.SERVER).await()
                owned(u)
                val next=if(fresh.exists()) RecurringTemplate.from(id,fresh.data!!) else null
                if(next!=null && next.valid() && next.updatedAt>attemptedRevision && next.nextDate!=date && receipt.exists()) return next
            }
            throw error
        }
    }
    suspend fun reconcile(u: String, now: Long = System.currentTimeMillis()): Int {
        val rows=getAll(u).toMutableList(); var count=0
        repeat(Recurrence.MAX_PER_PASS) {
            val due=rows.filter { it.enabled && it.nextDate != null && it.nextDate <= Recurrence.localDate(now,it.timeZone) }.minWithOrNull(compareBy<RecurringTemplate> { it.nextDate }.thenBy { it.id }) ?: return count
            val next=materialize(u,due.id,now); val index=rows.indexOfFirst { it.id == due.id }
            if(next != null) { rows[index]=next; count++ } else rows.removeAt(index)
        }
        return count
    }
}
