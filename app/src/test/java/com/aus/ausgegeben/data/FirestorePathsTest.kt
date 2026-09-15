package com.aus.ausgegeben.data

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * DEL-1 regression: a new account-owned Firestore path must be impossible to add
 * without an explicit decision about whether account deletion covers it. Mirrors
 * web/src/repositories/firestorePaths.test.ts — keep both in sync.
 */
class FirestorePathsTest {

    @Test
    fun `classifies every whole-collection constant as deletable`() {
        assertTrue(FirestorePaths.CATEGORIES_COLLECTION in FirestorePaths.DELETABLE_USER_COLLECTIONS)
        assertTrue(FirestorePaths.EXPENSES_COLLECTION in FirestorePaths.DELETABLE_USER_COLLECTIONS)
    }

    @Test
    fun `classifies every named single-document constant as exactly one of deletable or intentionally retained`() {
        val namedDocs = listOf(
            FirestorePaths.UserDocPath(FirestorePaths.SETTINGS_COLLECTION, FirestorePaths.PREFERENCES_DOC),
            FirestorePaths.UserDocPath(FirestorePaths.META_COLLECTION, FirestorePaths.DEDUPE_DOC),
            FirestorePaths.UserDocPath(FirestorePaths.META_COLLECTION, FirestorePaths.ACCOUNT_DELETION_DOC),
        )
        for (doc in namedDocs) {
            val deletable = doc in FirestorePaths.DELETABLE_USER_DOCS
            val retained = doc in FirestorePaths.INTENTIONALLY_RETAINED_USER_DOCS
            assertTrue(
                "$doc must be classified as exactly one of deletable/retained (deletable=$deletable, retained=$retained)",
                deletable != retained,
            )
        }
    }

    /**
     * The two tests above only check a fixed, hand-written set of names they already
     * expect to see — they would not fail if a *new* `const val` were added to
     * [FirestorePaths] without ever being added to a classification list (independently
     * proven during review, on the mirrored web module: adding an unclassified
     * `RECEIPTS_COLLECTION` constant left both prior-style tests green). This test
     * instead reflects over the object's own declared String constants, so it fails on
     * any future constant no matter what it's called.
     */
    @Test
    fun `every declared String path constant is reachable through a classification list`() {
        val classifiedNames = buildSet {
            addAll(FirestorePaths.DELETABLE_USER_COLLECTIONS)
            FirestorePaths.DELETABLE_USER_DOCS.forEach { add(it.collection); add(it.id) }
            FirestorePaths.INTENTIONALLY_RETAINED_USER_DOCS.forEach { add(it.collection); add(it.id) }
        }

        val stringConstants = FirestorePaths::class.java.declaredFields
            .filter { java.lang.reflect.Modifier.isStatic(it.modifiers) && it.type == String::class.java }
            .associate { field ->
                field.isAccessible = true
                field.name to (field.get(null) as String)
            }
        assertTrue("expected at least one String constant on FirestorePaths", stringConstants.isNotEmpty())

        for ((name, value) in stringConstants) {
            assertTrue(
                "$name = \"$value\" is declared but does not appear in DELETABLE_USER_COLLECTIONS, " +
                    "DELETABLE_USER_DOCS, or INTENTIONALLY_RETAINED_USER_DOCS — classify it.",
                value in classifiedNames,
            )
        }
    }

    /**
     * The registry can be internally consistent yet still miss a path that
     * firestore.rules actually permits — this ties it back to the authoritative schema
     * definition instead of only checking the registry against itself.
     */
    @Test
    fun `covers every per-user collection and named document that firestore rules actually permits`() {
        val rulesFile = findFirestoreRules()
        val rules = rulesFile.readText()

        val usersBlockStart = rules.indexOf("match /users/{userId}")
        assertTrue("firestore.rules must declare match /users/{userId}", usersBlockStart >= 0)
        val body = rules.substring(usersBlockStart)

        val collectionRegex = Regex("""match /(\w+)/\{(\w+)\}""")
        val subcollections = collectionRegex.findAll(body)
            .map { it.groupValues[1] }
            .filter { it != "users" }
            .toSet()

        assertEquals(
            setOf(
                FirestorePaths.CATEGORIES_COLLECTION,
                FirestorePaths.EXPENSES_COLLECTION,
                FirestorePaths.SETTINGS_COLLECTION,
                FirestorePaths.META_COLLECTION,
            ),
            subcollections,
        )

        val docIdRegex = Regex("""docId == '([\w-]+)'""")
        val docIdLiterals = docIdRegex.findAll(rules).map { it.groupValues[1] }.toSet()

        assertEquals(
            setOf(
                FirestorePaths.PREFERENCES_DOC,
                FirestorePaths.DEDUPE_DOC,
                FirestorePaths.ACCOUNT_DELETION_DOC,
            ),
            docIdLiterals,
        )
    }

    /** Gradle's test working directory is the module dir (app/); walk up to find the repo root. */
    private fun findFirestoreRules(): File {
        var dir = File(".").absoluteFile
        repeat(6) {
            val candidate = File(dir, "firestore.rules")
            if (candidate.exists()) return candidate
            dir = dir.parentFile ?: return@repeat
        }
        throw IllegalStateException("Could not locate firestore.rules from ${File(".").absolutePath}")
    }
}
