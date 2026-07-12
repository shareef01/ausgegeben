package com.aus.ausgegeben.data.cloud

data class FirestorePulledDoc<T>(
    val docId: String,
    val record: T,
)

data class DedupedPull<T>(
    val records: List<T>,
    /** Physical Firestore doc ids to hard-delete (legacy numeric docs that are redundant). */
    val legacyDocIdsToDelete: List<String>,
    /**
     * cloudIds of content-identical duplicate copies (distinct from the canonical copy). These
     * should be tombstoned in the cloud and removed from the local DB so every device converges
     * on a single copy.
     */
    val duplicateCloudIds: List<String> = emptyList(),
    /**
     * Map of duplicate cloudId to canonical survivor cloudId. Used to reassign local linked rows
     * (like expenses) before the duplicate category is purged.
     */
    val remapCloudIds: Map<String, String> = emptyMap()
)

fun isLegacyFirestoreDocId(docId: String): Boolean =
    docId.isNotEmpty() && docId.all { it.isDigit() }

private fun isUuidShape(value: String): Boolean =
    value.length >= 32 && value.contains('-')

fun dedupeLegacyCategoryDocs(docs: List<FirestorePulledDoc<CloudCategoryRecord>>): DedupedPull<CloudCategoryRecord> =
    dedupeLegacyDocs(
        docs = docs,
        fingerprint = { "${it.name}|${it.iconName}|${it.colorInt}|${it.transactionType}|${it.sortOrder}" },
        cloudIdOf = { it.cloudId },
        // COLLAPSE duplicates: if the user has redundant "Food" categories from different 
        // devices or legacy imports, merge them to prevent UI clutter.
        collapseContentDuplicates = true,
        isRecovered = { it.name == "Recovered" }
    )

fun dedupeLegacyExpenseDocs(docs: List<FirestorePulledDoc<CloudExpenseRecord>>): DedupedPull<CloudExpenseRecord> =
    dedupeLegacyDocs(
        docs = docs,
        fingerprint = {
            "${it.amount}|${it.dateMillis}|${it.note}|${it.transactionType}|${it.receiptImagePath.orEmpty()}"
        },
        cloudIdOf = { it.cloudId },
        collapseContentDuplicates = true,
    )

private data class InternalDoc<T>(
    val docId: String,
    val record: T,
    val legacy: Boolean,
)

/** Prefer a modern (uuid) doc as the survivor, then the smallest cloudId for determinism. */
private fun <T> chooseCanonical(group: List<InternalDoc<T>>, cloudIdOf: (T) -> String): InternalDoc<T> =
    group.sortedWith(compareBy({ it.legacy }, { cloudIdOf(it.record) })).first()

private fun <T> dedupeLegacyDocs(
    docs: List<FirestorePulledDoc<T>>,
    fingerprint: (T) -> String,
    cloudIdOf: (T) -> String,
    collapseContentDuplicates: Boolean,
    isRecovered: (T) -> Boolean = { false }
): DedupedPull<T> {
    val internal = docs.map { InternalDoc(it.docId, it.record, isLegacyFirestoreDocId(it.docId)) }
    val modern = internal.filter { !it.legacy }
    val legacy = internal.filter { it.legacy }
    val legacyDocIdsToDelete = mutableListOf<String>()
    val remapCloudIds = mutableMapOf<String, String>()

    val modernByCloudId = modern.associateBy { cloudIdOf(it.record) }
    val modernByFingerprint = modern.groupBy { fingerprint(it.record) }

    // Phase 1: collapse legacy docs that are the same entity (cloudId pointer) or a content
    // duplicate of a modern doc.
    val keptLegacy = mutableListOf<InternalDoc<T>>()
    for (leg in legacy) {
        val dataCloudId = cloudIdOf(leg.record)

        if (isUuidShape(dataCloudId) && dataCloudId != leg.docId && modernByCloudId.containsKey(dataCloudId)) {
            legacyDocIdsToDelete += leg.docId
            remapCloudIds[leg.docId] = dataCloudId
            continue
        }

        val modernMatch = modernByFingerprint[fingerprint(leg.record)]?.firstOrNull()
        if (modernMatch != null) {
            legacyDocIdsToDelete += leg.docId
            remapCloudIds[leg.docId] = cloudIdOf(modernMatch.record)
            continue
        }

        keptLegacy += leg
    }

    val candidates = modern + keptLegacy

    if (!collapseContentDuplicates) {
        return DedupedPull(
            records = candidates.map { it.record },
            legacyDocIdsToDelete = legacyDocIdsToDelete.distinct(),
            duplicateCloudIds = emptyList(),
            remapCloudIds = remapCloudIds
        )
    }

    // Phase 2: collapse content-identical duplicates among the survivors, keeping a single
    // canonical copy per fingerprint.
    val byFingerprint = candidates.groupBy { fingerprint(it.record) }
    val records = mutableListOf<T>()
    val duplicateCloudIds = mutableListOf<String>()
    val canonicalCloudIds = mutableSetOf<String>()

    for ((_, group) in byFingerprint) {
        val canonical = if (group.size == 1) group[0] else chooseCanonical(group, cloudIdOf)
        val canonicalCloudId = cloudIdOf(canonical.record)
        records += canonical.record
        canonicalCloudIds += canonicalCloudId

        if (group.size == 1) continue

        for (dup in group) {
            if (dup === canonical) continue
            val dupCloudId = cloudIdOf(dup.record)
            remapCloudIds[dupCloudId] = canonicalCloudId
            if (dupCloudId == canonicalCloudId) {
                legacyDocIdsToDelete += dup.docId
            } else {
                duplicateCloudIds += dupCloudId
                if (dup.docId != dupCloudId) legacyDocIdsToDelete += dup.docId
            }
        }
    }
    
    // Phase 3: Special case for "Recovered" categories. 
    // If a survivor is "Recovered", try to find a genuine category with same transaction type to merge into.
    val finalSurvivors = records.toMutableList()
    val recovered = finalSurvivors.filter(isRecovered)
    
    for (rec in recovered) {
        val recCloudId = cloudIdOf(rec)
        val type = fingerprint(rec).split('|').getOrNull(3) ?: ""
        // Find a standard category (not named "Recovered") with same transaction type
        val standardTarget = finalSurvivors.firstOrNull { 
            !isRecovered(it) && fingerprint(it).split('|').getOrNull(3) == type 
        }
        
        if (standardTarget != null) {
            val targetCloudId = cloudIdOf(standardTarget)
            duplicateCloudIds += recCloudId
            remapCloudIds[recCloudId] = targetCloudId
            finalSurvivors.remove(rec)
        }
    }

    return DedupedPull(
        records = finalSurvivors,
        legacyDocIdsToDelete = legacyDocIdsToDelete.distinct(),
        duplicateCloudIds = duplicateCloudIds.distinct().filterNot { it in canonicalCloudIds },
        remapCloudIds = remapCloudIds
    )
}
