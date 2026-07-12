import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearLocalUserData = vi.fn(async () => undefined);
const fullSync = vi.fn(async () => ({ ok: true as const }));
const isCloudSyncActive = vi.fn(() => false);

vi.mock('@/services/database', () => ({
  clearLocalUserData,
}));

vi.mock('@/services/cloudSync', () => ({
  isCloudSyncActive,
}));

vi.mock('@/services/syncService', () => ({
  syncService: { fullSync },
}));

const storeState = {
  lastCloudSyncAt: 42,
  pendingExpenseDeleteCloudIds: ['a'],
  pendingCategoryDeleteCloudIds: ['b'],
  lastCloudUserId: 'uid-old',
};

vi.mock('@/services/preferencesStore', () => ({
  usePreferencesStore: {
    setState: (patch: Partial<typeof storeState>) => Object.assign(storeState, patch),
    getState: () => storeState,
  },
}));

describe('eraseLocalUserData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.lastCloudSyncAt = 42;
    storeState.pendingExpenseDeleteCloudIds = ['a'];
    storeState.pendingCategoryDeleteCloudIds = ['b'];
    storeState.lastCloudUserId = 'uid-old';
    isCloudSyncActive.mockReturnValue(false);
  });

  it('clears local tables and sync markers', async () => {
    const { eraseLocalUserData } = await import('@/services/localDataService');
    await eraseLocalUserData();
    expect(clearLocalUserData).toHaveBeenCalledTimes(1);
    expect(storeState.lastCloudSyncAt).toBeNull();
    expect(storeState.pendingExpenseDeleteCloudIds).toEqual([]);
    expect(storeState.pendingCategoryDeleteCloudIds).toEqual([]);
    expect(storeState.lastCloudUserId).toBeNull();
    expect(fullSync).not.toHaveBeenCalled();
  });

  it('full-syncs when cloud is active', async () => {
    isCloudSyncActive.mockReturnValue(true);
    fullSync.mockResolvedValueOnce({ ok: false, error: 'offline' });
    const { eraseLocalUserData } = await import('@/services/localDataService');
    await expect(eraseLocalUserData()).rejects.toThrow('offline');
    expect(fullSync).toHaveBeenCalledWith(true);
  });
});
