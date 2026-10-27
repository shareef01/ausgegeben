/**
 * Batch sizes shared by Replace (backupReplace.ts) and its safety snapshot
 * (backupSnapshot.ts). In their own module so neither imports the other.
 */
export const RESTORE_BATCH_CHUNK_SIZE = 400;
export const SNAPSHOT_CHUNK_SIZE = 100;
