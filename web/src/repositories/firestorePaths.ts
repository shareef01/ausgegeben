/**
 * Single source of truth for every per-user Firestore path this app writes to.
 *
 * Both the writers (expenseRepository.ts, preferencesSync.ts) and the account-deletion
 * sweep (expenseRepository.ts's deleteAllUserData) import these constants instead of
 * repeating string literals, so adding a new collection here is the same edit that
 * forces a decision about whether deleteAllUserData needs to cover it — see DEL-1.
 * `firestorePaths.test.ts` checks that every *exported string constant* in this module
 * (enumerated reflectively, not a hand-written guess list) resolves to a name that
 * appears somewhere in `DELETABLE_USER_COLLECTIONS`, `DELETABLE_USER_DOCS`, or
 * `INTENTIONALLY_RETAINED_USER_DOCS` — so a new constant added here without also being
 * added to one of those three lists fails CI, not just a constant the test happens to
 * already know the name of.
 *
 * `ACCOUNT_DELETION_DOC` is deliberately NOT included in the deletable lists: it is the
 * permanent write-freeze tombstone written by markAccountDeletionPending, and Firestore
 * rules give clients no permission to delete it (see firestore.rules and
 * docs/maintenance.md) — that is intentional, not an oversight, and this module must
 * not be used to "fix" it by adding it to the deletable set.
 */

export const CATEGORIES_COLLECTION = 'categories';
export const EXPENSES_COLLECTION = 'expenses';
export const SETTINGS_COLLECTION = 'settings';
export const PREFERENCES_DOC = 'preferences';
export const META_COLLECTION = 'meta';
export const DEDUPE_DOC = 'dedupe';
export const ACCOUNT_DELETION_DOC = 'accountDeletion';

interface UserDocPath {
  collection: string;
  id: string;
}

/** Every per-user subcollection whose documents deleteAllUserData wipes in full. */
export const DELETABLE_USER_COLLECTIONS: readonly string[] = [
  CATEGORIES_COLLECTION,
  EXPENSES_COLLECTION,
];

/** Every per-user single document (not a whole collection) that deleteAllUserData wipes. */
export const DELETABLE_USER_DOCS: readonly UserDocPath[] = [
  { collection: SETTINGS_COLLECTION, id: PREFERENCES_DOC },
  { collection: META_COLLECTION, id: DEDUPE_DOC },
];

/**
 * Per-user documents that exist but are deliberately never deleted by a client. Every
 * constant declared above must appear in exactly one of this list or the two above —
 * enforced by firestorePaths.test.ts — so a new collection can never be silently
 * forgotten by account deletion.
 */
export const INTENTIONALLY_RETAINED_USER_DOCS: readonly UserDocPath[] = [
  { collection: META_COLLECTION, id: ACCOUNT_DELETION_DOC },
];
