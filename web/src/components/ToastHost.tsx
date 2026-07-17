import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';

export function ToastHost() {
  const { t } = useTranslation();
  const message = useToastStore((s) => s.message);
  const actionLabel = useToastStore((s) => s.actionLabel);
  const onAction = useToastStore((s) => s.onAction);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!message) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="toast-host__action" onClick={() => { onAction(); dismiss(); }}>
          {actionLabel}
        </button>
      ) : null}
      <button type="button" className="toast-host__dismiss" aria-label={t('actionDismiss')} onClick={dismiss}>
        &times;
      </button>
    </div>
  );
}
