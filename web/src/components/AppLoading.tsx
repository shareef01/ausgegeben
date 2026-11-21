import { t } from '@/i18n';

export function AppLoading() {
  return (
    <div
      className="loading-screen"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t('loading')}</span>
      <div className="btn__spinner" aria-hidden><span className="spin-dot" /><span className="spin-dot" /><span className="spin-dot" /></div>
    </div>
  );
}
