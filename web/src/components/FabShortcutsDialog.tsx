import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Plus } from 'lucide-react';
import { SignatureText } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';

interface FabShortcutsDialogProps {
  onClose: () => void;
  onScanReceipt: () => void;
  onNewTransaction: () => void;
}

export function FabShortcutsDialog({ onClose, onScanReceipt, onNewTransaction }: FabShortcutsDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useSheetScrollLock();
  useFocusTrap(true, dialogRef, () => {
    hapticLight();
    onClose();
  });

  const sheet = (
    <div className="overlay overlay--confirm" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="sheet sheet--confirm insights-glass-island"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fab-shortcuts-title"
      >
        <h2 id="fab-shortcuts-title" className="sheet--confirm__title">
          <SignatureText text={t('addTransaction')} as="span" />
        </h2>
        <div className="fab-shortcuts__actions">
          <button
            type="button"
            className="btn btn-primary btn-block fab-shortcuts__btn"
            onClick={() => {
              hapticMedium();
              onScanReceipt();
            }}
          >
            <Camera size={20} aria-hidden />
            {t('addScanReceipt')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block fab-shortcuts__btn"
            onClick={() => {
              hapticMedium();
              onNewTransaction();
            }}
          >
            <Plus size={20} aria-hidden />
            {t('addNewTitle')}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => { hapticLight(); onClose(); }}>
            {t('actionCancel')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}
