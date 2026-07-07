import type { ReactNode } from 'react';
import { useRef } from 'react';import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode;
  header: ReactNode;
  sheetClassName?: string;
  bodyClassName?: string;
  ariaLabelledBy?: string;
}

export function BottomSheet({
  onClose,
  children,
  header,
  sheetClassName = '',
  bodyClassName = '',
  ariaLabelledBy,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetClasses = ['sheet', 'sheet--settings', sheetClassName].filter(Boolean).join(' ');
  const bodyClasses = ['sheet--settings__body', bodyClassName].filter(Boolean).join(' ');

  useFocusTrap(true, sheetRef, onClose);

  useSheetScrollLock();

  const sheet = (
    <div className="overlay overlay--settings" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className={sheetClasses}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        <div className="sheet--settings__handle" aria-hidden />
        {header}
        <div className={bodyClasses}>{children}</div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}
