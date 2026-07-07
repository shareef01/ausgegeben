import { syncService } from '@/services/syncService';
import { isCloudSyncActive } from '@/services/cloudSync';
import { t } from '@/i18n';

export interface CloudRefreshResult {
  ok: boolean;
  error?: string;
}

/** Pull from cloud (when signed in), then run the caller's reload. */
export async function cloudRefreshThenReload(
  reload: () => Promise<void>,
): Promise<CloudRefreshResult> {
  if (isCloudSyncActive()) {
    const result = await syncService.fullSync(true);
    if (!result.ok) {
      return { ok: false, error: result.error ?? t('errorLoadFailed') };
    }
  }
  await reload();
  return { ok: true };
}
