import { clearLocalUserData } from '@/services/database';
import { isCloudSyncActive } from '@/services/cloudSync';
import { usePreferencesStore } from '@/services/preferencesStore';
import { syncService } from '@/services/syncService';

/** User-initiated wipe (Settings). Cloud data is not deleted. */
export async function eraseLocalUserData(): Promise<void> {
  await clearLocalUserData();
  usePreferencesStore.setState({
    lastCloudSyncAt: null,
    pendingExpenseDeleteCloudIds: [],
    pendingCategoryDeleteCloudIds: [],
    lastCloudUserId: null,
  });
  if (isCloudSyncActive()) {
    const result = await syncService.fullSync(true);
    if (!result.ok) {
      throw new Error(result.error ?? 'sync_failed');
    }
  }
}
