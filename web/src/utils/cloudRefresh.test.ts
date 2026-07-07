import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cloudRefreshThenReload } from '@/utils/cloudRefresh';

const { fullSyncMock, isCloudSyncActiveMock } = vi.hoisted(() => ({
  fullSyncMock: vi.fn(),
  isCloudSyncActiveMock: vi.fn(),
}));

vi.mock('@/services/syncService', () => ({
  syncService: { fullSync: fullSyncMock },
}));

vi.mock('@/services/cloudSync', () => ({
  isCloudSyncActive: isCloudSyncActiveMock,
}));

describe('cloudRefreshThenReload', () => {
  beforeEach(() => {
    fullSyncMock.mockReset();
    isCloudSyncActiveMock.mockReset();
  });

  it('reloads without sync when cloud is inactive', async () => {
    isCloudSyncActiveMock.mockReturnValue(false);
    const reload = vi.fn().mockResolvedValue(undefined);

    const result = await cloudRefreshThenReload(reload);

    expect(result).toEqual({ ok: true });
    expect(fullSyncMock).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('returns sync error without reloading when pull fails', async () => {
    isCloudSyncActiveMock.mockReturnValue(true);
    fullSyncMock.mockResolvedValue({ ok: false, error: 'network down' });
    const reload = vi.fn();

    const result = await cloudRefreshThenReload(reload);

    expect(result).toEqual({ ok: false, error: 'network down' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('syncs then reloads when cloud is active', async () => {
    isCloudSyncActiveMock.mockReturnValue(true);
    fullSyncMock.mockResolvedValue({ ok: true });
    const reload = vi.fn().mockResolvedValue(undefined);

    const result = await cloudRefreshThenReload(reload);

    expect(result).toEqual({ ok: true });
    expect(fullSyncMock).toHaveBeenCalledWith(true);
    expect(reload).toHaveBeenCalledOnce();
  });
});
