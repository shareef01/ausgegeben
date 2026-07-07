import { useState } from 'react';
import { SettingsBottomSheet } from '@/components/SettingsBottomSheet';
import { useTranslation } from '@/i18n';
import { applyLocalDateToMillis, toDateInputValue } from '@/utils/periodUtils';

interface DatePickerSheetProps {
  valueMillis: number;
  onDismiss: () => void;
  onConfirm: (millis: number) => void;
}

export function DatePickerSheet({ valueMillis, onDismiss, onConfirm }: DatePickerSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(toDateInputValue(valueMillis));

  return (
    <SettingsBottomSheet title={t('dateLabel')} onClose={onDismiss}>
      <label className="field">
        <span className="field__label">{t('dateLabel')}</span>
        <input
          className="field__input field__input--time"
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <div className="settings-confirm-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onDismiss}>
          {t('actionCancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!draft) return;
            onConfirm(applyLocalDateToMillis(valueMillis, draft));
            onDismiss();
          }}
        >
          {t('actionSave')}
        </button>
      </div>
    </SettingsBottomSheet>
  );
}
