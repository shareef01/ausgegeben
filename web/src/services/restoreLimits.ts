/**
 * Batch sizes shared by Replace (backupReplace.ts) and its safety snapshot
 * (backupSnapshot.ts). In their own module so neither imports the other.
 */
export const RESTORE_BATCH_CHUNK_SIZE = 400;
/**
 * Records per safety-snapshot document. 300 keeps a worst-case chunk (2,000-character
 * notes plus every bounded legacy field) under Firestore's 1 MiB document limit.
 */
export const SNAPSHOT_CHUNK_SIZE = 300;
/**
 * Most expense or receipt chunks one snapshot may have. firestore.rules accepts only
 * chunk_0..99 and receipt_chunk_0..99, which caps how much one account can park in
 * restoreSnapshot; keep the two in step.
 */
export const MAX_SNAPSHOT_CHUNKS = 100;
