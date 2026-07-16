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
    <div className="overlay" onClick={onCancel} role="presentation">
      <div
        ref={sheetRef}
        className="sheet sheet--settings"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <div className="sheet--settings__header">
          <h2 id={titleId} className="sheet--settings__title">{title}</h2>
        </div>
        <div className="sheet--settings__body">
          {typeof message === 'string' ? (
            <p id={messageId} className="confirm-dialog__message">{message}</p>
          ) : (
            <div id={messageId} className="confirm-dialog__message">{message}</div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary px-6 py-3 rounded-xl font-semibold text-sm" onClick={onCancel}>
              {cancelText}
            </button>
            <button
              type="button"
              className={`btn px-8 py-3 rounded-xl font-semibold text-sm active:scale-[0.98] ${destructive ? 'btn-destructive' : 'btn-primary'}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
