import { useTranslation } from '@/i18n';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useCallback, useRef, type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onCancel(), [onCancel]);
  useFocusTrap(open, sheetRef, handleEscape);
  useBodyScrollLock(open);

  if (!open) return null;

  const confirmText = confirmLabel ?? t('actionDelete');
  const cancelText = cancelLabel ?? t('actionCancel');
  const titleId = 'confirm-dialog-title';
  const messageId = 'confirm-dialog-message';

  return (
    <div className="overlay overlay--confirm" onClick={onCancel} role="presentation">
      <div
        ref={sheetRef}
        className={`confirm-dialog${destructive ? ' confirm-dialog--destructive' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="confirm-dialog__title">{title}</h2>
        {typeof message === 'string' ? (
          <p id={messageId} className="confirm-dialog__message">{message}</p>
        ) : (
          <div id={messageId} className="confirm-dialog__message">{message}</div>
        )}
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-secondary confirm-dialog__btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn confirm-dialog__btn ${destructive ? 'btn-destructive' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
