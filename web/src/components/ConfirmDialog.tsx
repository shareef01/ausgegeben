import type { ReactNode } from 'react';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = true,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleCancel = () => {
    hapticLight();
    onCancel();
  };

  const handleConfirm = () => {
    hapticMedium();
    onConfirm();
  };

  useFocusTrap(true, dialogRef, () => {
    hapticLight();
    onCancel();
  });

  const dialog = (
    <div className="overlay overlay--confirm" onClick={handleCancel} role="presentation">
      <div
        ref={dialogRef}
        className="confirm-dialog confirm-dialog--glass"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h3 id="confirm-dialog-title" className="confirm-dialog__title">{title}</h3>
        <div className="confirm-dialog__body">{children}</div>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn btn-destructive' : 'btn btn-primary'}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog;
}
