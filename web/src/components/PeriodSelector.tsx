import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCalendar, IconCheck, IconChevronDown, IconHistory } from '@/components/Icons';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';
import { useTranslation } from '@/i18n';
import type { AnalyticsPeriodOption } from '@/models/types';

export function recordPeriodOptions() {
  const { t } = useTranslation();
  return [
    { key: 'this_month' as const, label: t('recordPeriodThisMonth') },
    { key: 'all_time' as const, label: t('recordPeriodAllTime') },
  ];
}

interface AnalyticsPeriodPickerProps {
  options: AnalyticsPeriodOption[];
  selectedKey: string;
  selectedLabel: string;
  onSelected: (option: AnalyticsPeriodOption) => void;
}

export function AnalyticsPeriodPicker({
  options,
  selectedKey,
  selectedLabel,
  onSelected,
}: AnalyticsPeriodPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTitleId = useId();
  const allTime = options.find((o) => o.storageKey === 'all_time');
  const quickOptions = options.filter((o) =>
    o.storageKey === 'all_time' || o.storageKey === 'this_month',
  );
  const months = options.filter((o) =>
    o.storageKey !== 'all_time' && o.storageKey !== 'this_month',
  );

  const closeSheet = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useFocusTrap(open, sheetRef, closeSheet);

  useSheetScrollLock(open);

  const sheet = open ? (
    <div className="overlay overlay--settings" onClick={closeSheet} role="presentation">
      <div
        ref={sheetRef}
        className="sheet period-picker-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={sheetTitleId}
      >
        <div className="period-picker-sheet__header">
          <h2 id={sheetTitleId}>{t('periodPickerTitle')}</h2>
          <p>{t('periodPickerSubtitle')}</p>
        </div>

        {allTime ? (
          <div className="period-picker-sheet__all-time-sticky">
            <button
              type="button"
              role="option"
              aria-selected={selectedKey === allTime.storageKey}
              className={`period-picker-option${selectedKey === allTime.storageKey ? ' period-picker-option--active' : ''}`}
              onClick={() => {
                onSelected(allTime);
                closeSheet();
              }}
            >
              <span className="period-picker-option__icon" aria-hidden>
                <IconHistory width={18} height={18} />
              </span>
              <span className="period-picker-option__label">{t('periodAllTime')}</span>
              {selectedKey === allTime.storageKey ? <IconCheck width={18} height={18} aria-hidden /> : null}
            </button>
          </div>
        ) : null}

        {months.length > 0 ? (
          <>
            <div className="section-title">{t('periodPickerMonths')}</div>
            <div className="settings-group period-picker-sheet__months" role="listbox" aria-labelledby={sheetTitleId}>
              {months.map((option) => {
                const active = option.storageKey === selectedKey;
                return (
                  <button
                    key={option.storageKey}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`period-picker-option ${active ? 'period-picker-option--active' : ''}`}
                    onClick={() => {
                      onSelected(option);
                      closeSheet();
                    }}
                  >
                    <span className="period-picker-option__icon" aria-hidden>
                      <IconCalendar width={18} height={18} />
                    </span>
                    <span className="period-picker-option__label">{option.label}</span>
                    {active ? <IconCheck width={18} height={18} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      {quickOptions.length > 0 ? (
        <div className="period-picker-quick" role="group" aria-label={t('periodPickerLabel')}>
          {quickOptions.map((option) => {
            const active = option.storageKey === selectedKey;
            return (
              <button
                key={option.storageKey}
                type="button"
                className={`period-picker-quick__chip${active ? ' period-picker-quick__chip--active' : ''}`}
                aria-pressed={active}
                onClick={() => onSelected(option)}
              >
                {option.storageKey === 'all_time' ? t('periodAllTime') : option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        className="period-picker insights-glass-island"
        aria-label={`${t('periodPickerOpen')}: ${selectedLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="period-picker__icon" aria-hidden>
          <IconCalendar width={20} height={20} />
        </span>
        <span className="period-picker__copy">
          <span className="period-picker__eyebrow">{t('periodPickerLabel')}</span>
          <span className="period-picker__value">{selectedLabel}</span>
        </span>
        <IconChevronDown width={18} height={18} className="period-picker__chevron" />
      </button>

      {typeof document !== 'undefined' && sheet ? createPortal(sheet, document.body) : sheet}
    </>
  );
}
