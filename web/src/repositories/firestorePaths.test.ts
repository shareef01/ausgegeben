import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as firestorePaths from './firestorePaths';
import {
  ACCOUNT_DELETION_DOC,
  CATEGORIES_COLLECTION,
  DEDUPE_DOC,
  DELETABLE_USER_COLLECTIONS,
  DELETABLE_USER_DOCS,
  EXPENSES_COLLECTION,
  INTENTIONALLY_RETAINED_USER_DOCS,
  META_COLLECTION,
  PREFERENCES_DOC,
  SETTINGS_COLLECTION,
} from './firestorePaths';

/**
 * DEL-1 regression: a new account-owned Firestore path must be impossible to add
 * without an explicit decision about whether account deletion covers it.
 */
describe('firestorePaths registry (DEL-1)', () => {
  it('classifies every whole-collection constant as deletable', () => {
    // categories/ and expenses/ are deleted document-by-document (not as single
    // named docs), so they are declared directly rather than as {collection, id} pairs.
    expect(DELETABLE_USER_COLLECTIONS).toContain(CATEGORIES_COLLECTION);
    expect(DELETABLE_USER_COLLECTIONS).toContain(EXPENSES_COLLECTION);
  });

  it('classifies every named single-document constant as exactly one of deletable or intentionally retained', () => {
    const namedDocs: Array<{ collection: string; id: string; label: string }> = [
      { collection: SETTINGS_COLLECTION, id: PREFERENCES_DOC, label: 'settings/preferences' },
      { collection: META_COLLECTION, id: DEDUPE_DOC, label: 'meta/dedupe' },
      { collection: META_COLLECTION, id: ACCOUNT_DELETION_DOC, label: 'meta/accountDeletion' },
    ];

    for (const doc of namedDocs) {
      const deletable = DELETABLE_USER_DOCS.some((d) => d.collection === doc.collection && d.id === doc.id);
      const retained = INTENTIONALLY_RETAINED_USER_DOCS.some(
        (d) => d.collection === doc.collection && d.id === doc.id,
      );
      expect(
        deletable !== retained, // exactly one, never both, never neither
        `${doc.label} must be classified as exactly one of deletable/retained (deletable=${deletable}, retained=${retained})`,
      ).toBe(true);
    }
  });

  // The two tests above only check a fixed, hand-written set of names they already
  // expect to see — they would not fail if a *new* constant were added to the module
  // without ever being added to a classification list (independently proven during
  // review: adding an unclassified `export const RECEIPTS_COLLECTION = 'receipts'`
  // above left both prior tests green). This test instead enumerates the module's
  // actual exports, so it fails on any future constant no matter what it's called.
  it('every exported string constant is reachable through a classification list', () => {
    const classifiedNames = new Set<string>([
      ...DELETABLE_USER_COLLECTIONS,
      ...DELETABLE_USER_DOCS.flatMap((d) => [d.collection, d.id]),
      ...INTENTIONALLY_RETAINED_USER_DOCS.flatMap((d) => [d.collection, d.id]),
    ]);

    const stringExports = Object.entries(firestorePaths as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    // Sanity check on the test itself: if this module ever stopped exporting any bare
    // string constant at all, the loop below would vacuously pass without checking
    // anything.
    expect(stringExports.length).toBeGreaterThan(0);

    for (const [name, value] of stringExports) {
      expect(
        classifiedNames.has(value),
        `${name} = '${value}' is exported but does not appear in DELETABLE_USER_COLLECTIONS, ` +
          `DELETABLE_USER_DOCS, or INTENTIONALLY_RETAINED_USER_DOCS — classify it.`,
      ).toBe(true);
    }
  });

  // The registry can be internally consistent yet still miss a path that firestore.rules
  // actually permits — this ties it back to the authoritative schema definition instead
  // of only checking the registry against itself.
  it('covers every per-user collection and named document that firestore.rules actually permits', () => {
    const rulesPath = path.resolve(__dirname, '../../../firestore.rules');
    const rules = readFileSync(rulesPath, 'utf8');

    // Every `match /<segment>/{...}` nested directly under `match /users/{userId} { ... }`.
    const usersBlockStart = rules.indexOf('match /users/{userId}');
    expect(usersBlockStart).toBeGreaterThan(-1);
    const collectionMatches = [
      ...rules.slice(usersBlockStart).matchAll(/match \/(\w+)\/\{(\w+)\}/g),
    ].map((m) => m[1]);
    // The outer match itself isn't a subcollection segment.
    const subcollections = collectionMatches.filter((name) => name !== 'users');

    expect(new Set(subcollections)).toEqual(
      new Set([CATEGORIES_COLLECTION, EXPENSES_COLLECTION, SETTINGS_COLLECTION, META_COLLECTION]),
    );

    // Every `docId == '...'` literal anywhere in the file — these are the only doc ids
    // the rules ever grant any permission for under settings/ or meta/.
    const docIdLiterals = new Set(
      [...rules.matchAll(/docId == '([\w-]+)'/g)].map((m) => m[1]),
    );
    expect(docIdLiterals).toEqual(new Set([PREFERENCES_DOC, DEDUPE_DOC, ACCOUNT_DELETION_DOC]));
  });
});
