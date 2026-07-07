import { t } from '@/i18n';

export function mapSyncError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
  if (code === 'permission-denied') {
    return t('settingsSyncErrorPermission');
  }
  if (code === 'unavailable' || code === 'network-request-failed') {
    return t('settingsSyncErrorNetwork');
  }
  if (error instanceof Error && error.message) return error.message;
  return t('settingsSyncErrorGeneric');
}
