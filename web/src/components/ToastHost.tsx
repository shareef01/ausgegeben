import { useEffect } from 'react';
import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';

export function ToastHost() {
  const { t } = useTranslation();
  const message = useToastStore((s) => s.message);
  const actionLabel = useToastStore((s) => s.actionLabel);
  const onAction = useToastStore((s) => s.onAction);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, dismiss]);

  if (!message) return null;

  return (
    <div className="toast-host toast-host--visible" role="status" aria-live="polite" aria-atomic="true">
      <button type="button" className="toast-host__message" onClick={dismiss} aria-label={t('actionClose')}>
        {message}
      </button>
      {actionLabel && onAction ? (
        <button type="button" className="toast-host__action" onClick={() => { onAction(); dismiss(); }}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
