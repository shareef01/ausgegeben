import type { ReactNode } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { useTranslation } from '@/i18n';

interface SettingsBottomSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  selectionGroup?: boolean;
}

export function SettingsBottomSheet({
  title,
  subtitle,
  onClose,
  children,
  bodyClassName,
  selectionGroup = false,
}: SettingsBottomSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      onClose={onClose}
      bodyClassName={bodyClassName}
      ariaLabelledBy="settings-sheet-title"
      header={(
        <div className={`sheet--settings__header${subtitle ? ' sheet--settings__header--stacked' : ''}`}>
          <div className="sheet__header-text">
            <h2 id="settings-sheet-title" className="sheet--settings__title">{title}</h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="sheet--settings__close" onClick={onClose} aria-label={t('actionClose')}>
            {t('actionClose')}
          </button>
        </div>
      )}
    >
      {selectionGroup ? (
        <div role="radiogroup" aria-labelledby="settings-sheet-title">
          {children}
        </div>
      ) : children}
    </BottomSheet>
  );
}
