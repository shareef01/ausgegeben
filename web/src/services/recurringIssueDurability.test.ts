import { beforeEach, describe, expect, it, vi } from 'vitest';

const reconcile = vi.fn();
const catchUpIncomplete = vi.fn(() => false);
vi.mock('@/services/recurringRepository', () => ({
  recurringRepository: { reconcile: (...a: unknown[]) => reconcile(...a), getRecurringIssues: () => currentIssues, catchUpIncomplete: () => catchUpIncomplete() },
}));
let currentIssues: Array<Record<string, string>> = [];

const { useRecurringStore, syncRecurring } = await import('@/services/recurringStore');
const { useAuthStore } = await import('@/services/authStore');

const issue = { code: 'RECURRING_RECEIPT_INVALID', templateId: 't1', scheduledDate: '2024-01-31', receiptId: 'r', receiptExpenseId: 'b', expectedExpenseId: 'a' };
const signIn = (uid: string) => useAuthStore.setState({ user: { uid, email: null, displayName: null, emailVerified: true } });

describe('recurring issue-state durability', () => {
  beforeEach(() => {
    reconcile.mockReset();
    catchUpIncomplete.mockReset();
    catchUpIncomplete.mockReturnValue(false);
    currentIssues = [];
    useRecurringStore.setState({ owner: null, rows: [], incomplete: false, error: false, syncing: false, issues: [], quarantined: false });
    signIn('u1');
    useRecurringStore.setState({ owner: 'u1' });
  });

  // AUS-202: a pass that leaves due work behind is followed by another in the same sync.
  it('runs another pass when the first leaves a backlog, then records the result', async () => {
    currentIssues = [];
    reconcile.mockResolvedValue(20);
    catchUpIncomplete.mockReturnValueOnce(true).mockReturnValue(false);
    await syncRecurring();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(useRecurringStore.getState().error).toBe(false);
    expect(useRecurringStore.getState().syncing).toBe(false);
  });

  it('stops the backlog run when another account signs in', async () => {
    reconcile.mockImplementation(async () => { signIn('u2'); return 20; });
    catchUpIncomplete.mockReturnValue(true);
    await syncRecurring();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('records confirmed quarantine after a successful pass', async () => {
    currentIssues = [issue];
    reconcile.mockResolvedValue(3);
    await syncRecurring();
    expect(useRecurringStore.getState().quarantined).toBe(true);
    expect(useRecurringStore.getState().issues).toHaveLength(1);
    expect(useRecurringStore.getState().error).toBe(false);
  });

  it('keeps confirmed issues visible when a later pass fails (network/auth)', async () => {
    currentIssues = [issue];
    reconcile.mockResolvedValue(1);
    await syncRecurring();
    reconcile.mockRejectedValue(new Error('offline'));
    await syncRecurring();
    const s = useRecurringStore.getState();
    expect(s.error).toBe(true);
    expect(s.quarantined).toBe(true);
    expect(s.issues).toHaveLength(1);
  });

  it('clears the warning only after a verified healthy pass', async () => {
    currentIssues = [issue];
    reconcile.mockResolvedValue(1);
    await syncRecurring();
    currentIssues = [];
    reconcile.mockResolvedValue(1);
    await syncRecurring();
    expect(useRecurringStore.getState().quarantined).toBe(false);
    expect(useRecurringStore.getState().issues).toHaveLength(0);
  });

  it('never adopts another account\'s issues', async () => {
    currentIssues = [issue];
    reconcile.mockResolvedValue(1);
    await syncRecurring();
    signIn('u2');
    useRecurringStore.setState({ owner: 'u2', issues: [], quarantined: false });
    expect(useRecurringStore.getState().issues).toHaveLength(0);
  });
});
