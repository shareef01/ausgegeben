import type { RecurringTemplate } from '@/services/recurrence';

/**
 * The slice of `recurringRepository` the pause/resume and delete retries need. Narrowed to an
 * interface so the retry rules can be exercised against a controlled fake, exactly like the
 * repository itself is exercised against the emulator.
 */
export interface RecurringConflictRepository {
  getAll(uid: string): Promise<RecurringTemplate[]>;
  save(uid: string, template: RecurringTemplate, expectedAt: number | null): Promise<void>;
  remove(uid: string, id: string, expectedAt: number): Promise<void>;
}

const CONFLICT = 'RECURRING_CONFLICT';

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.message === CONFLICT;
}

/**
 * Pause or resume, retrying a stale-revision conflict once.
 *
 * Saving a template catches up today's occurrence, and that pass advances the template's
 * `updatedAt`. A pause tapped while the pass is landing therefore carries a revision the
 * server has already replaced and is rejected with `RECURRING_CONFLICT`. Re-read the server
 * revision once and repeat the same intent.
 *
 * The retry is built from the *fresh* row so every unrelated concurrent change survives; only
 * `enabled` comes from the caller. A row that has been deleted meanwhile fails closed with the
 * original conflict instead of resurrecting it, a second conflict is not retried again, and no
 * non-conflict error is ever retried. Ownership is enforced by the repository on both calls.
 */
export async function saveRecurringWithConflictRetry(
  repository: RecurringConflictRepository,
  owner: string,
  row: RecurringTemplate,
  desiredEnabled: boolean,
): Promise<void> {
  try {
    await repository.save(owner, { ...row, enabled: desiredEnabled }, row.updatedAt);
  } catch (error) {
    if (!isConflict(error)) throw error;
    const fresh = (await repository.getAll(owner)).find((r) => r.id === row.id);
    if (!fresh) throw error;
    await repository.save(owner, { ...fresh, enabled: desiredEnabled }, fresh.updatedAt);
  }
}

/**
 * Delete, retrying a stale-revision conflict once. Same rule as the pause path: refresh the
 * revision and repeat the same intent, fail closed if the row is already gone, and never
 * retry anything but `RECURRING_CONFLICT`.
 */
export async function removeRecurringWithConflictRetry(
  repository: RecurringConflictRepository,
  owner: string,
  row: RecurringTemplate,
): Promise<void> {
  try {
    await repository.remove(owner, row.id, row.updatedAt);
  } catch (error) {
    if (!isConflict(error)) throw error;
    const fresh = (await repository.getAll(owner)).find((r) => r.id === row.id);
    if (!fresh) throw error;
    await repository.remove(owner, row.id, fresh.updatedAt);
  }
}
