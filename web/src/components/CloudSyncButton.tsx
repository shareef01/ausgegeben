import { IconSync } from '@/components/Icons';
import { useTranslation } from '@/i18n';

interface CloudSyncButtonProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export function CloudSyncButton({ refreshing, onRefresh }: CloudSyncButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="record-sync-btn add-sheet__icon-btn insights-glass-island"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={refreshing ? t('syncInProgress') : t('syncNow')}
    >
      <IconSync width={18} height={18} className={refreshing ? 'spin' : ''} aria-hidden />
    </button>
  );
}
