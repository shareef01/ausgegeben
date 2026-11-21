import { useToastStore } from '@/services/toastStore';
import { useTranslation } from '@/i18n';

export function ToastHost() {
  const { t } = useTranslation();
  const message = useToastStore((s) => s.message);
  const actionLabel = useToastStore((s) => s.actionLabel);
  const onAction = useToastStore((s) => s.onAction);
  const dismiss = useToastStore((s) => s.dismiss);

  // The live region stays mounted and only its content changes: a region inserted together
  // with its first message is often not announced by screen readers.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {message ? (
        <div className="toast-host">
          <span className="toast-host__message">{message}</span>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="toast-host__action"
              onClick={() => {
                onAction();
                dismiss({ skipDismissCallback: true });
              }}
            >
              {actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="toast-host__dismiss"
            aria-label={t('actionDismiss')}
            onClick={() => dismiss()}
          >
            &times;
          </button>
        </div>
      ) : null}
    </div>
  );
}
