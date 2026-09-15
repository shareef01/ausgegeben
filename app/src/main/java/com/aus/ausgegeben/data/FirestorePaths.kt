package com.aus.ausgegeben.data

/**
 * Single source of truth for every per-user Firestore path this app writes to.
 *
 * Both the writers (AppRepository.kt, PreferencesCloudSync.kt) and the account-deletion
 * sweep (AppRepository.deleteAllUserData) use these constants instead of repeating
 * string literals, so adding a new collection here is the same edit that forces a
 * decision about whether deleteAllUserData needs to cover it — see DEL-1.
 * [FirestorePathsTest] checks that every declared `const val String` on this object
 * (found reflectively, not a hand-written guess list) resolves to a name that appears
 * somewhere in [DELETABLE_USER_COLLECTIONS], [DELETABLE_USER_DOCS], or
 * [INTENTIONALLY_RETAINED_USER_DOCS] — so a new constant added here without also being
 * added to one of those three lists fails CI, not just a constant the test happens to
 * already know the name of. Mirrors web/src/repositories/firestorePaths.ts — keep both
 * in sync.
 *
 * [ACCOUNT_DELETION_DOC] is deliberately NOT included in the deletable lists: it is the
 * permanent write-freeze tombstone written by markAccountDeletionPending, and Firestore
 * rules give clients no permission to delete it (see firestore.rules and
 * docs/maintenance.md) — that is intentional, not an oversight.
 */
object FirestorePaths {
    const val CATEGORIES_COLLECTION = "categories"
    const val EXPENSES_COLLECTION = "expenses"
    const val SETTINGS_COLLECTION = "settings"
    const val PREFERENCES_DOC = "preferences"
    const val META_COLLECTION = "meta"
    const val DEDUPE_DOC = "dedupe"
    const val ACCOUNT_DELETION_DOC = "accountDeletion"

    data class UserDocPath(val collection: String, val id: String)

    /** Every per-user subcollection whose documents deleteAllUserData wipes in full. */
    val DELETABLE_USER_COLLECTIONS: List<String> = listOf(CATEGORIES_COLLECTION, EXPENSES_COLLECTION)

    /** Every per-user single document (not a whole collection) that deleteAllUserData wipes. */
    val DELETABLE_USER_DOCS: List<UserDocPath> = listOf(
        UserDocPath(SETTINGS_COLLECTION, PREFERENCES_DOC),
        UserDocPath(META_COLLECTION, DEDUPE_DOC),
    )

    /**
     * Per-user documents that exist but are deliberately never deleted by a client.
     * Every `const val String` declared above must appear in exactly one of this list
     * or the two above — enforced reflectively by [FirestorePathsTest] — so a new
     * collection can never be silently forgotten by account deletion.
     */
    val INTENTIONALLY_RETAINED_USER_DOCS: List<UserDocPath> = listOf(
        UserDocPath(META_COLLECTION, ACCOUNT_DELETION_DOC),
    )
}