import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { IconCalendar, IconCheck, IconChevronDown, IconHistory } from '@/components/Icons';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import type { AnalyticsPeriodOption } from '@/models/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface PremiumPeriodSelectorProps<T> {
  options: T[];
  selected: T;
  labelFor: (item: T) => string;
  isSelected?: (a: T, b: T) => boolean;
  onSelected: (item: T) => void;
}

export function PremiumPeriodSelector<T>({
  options,
  selected,
  labelFor,
  isSelected = (a, b) => a === b,
  onSelected,
}: PremiumPeriodSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="period-select" ref={rootRef}>
      <button
        type="button"
        className="period-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="period-select__label">{labelFor(selected)}</span>
        <IconChevronDown width={16} height={16} className={`period-select__chevron ${open ? 'period-select__chevron--open' : ''}`} />
      </button>
      {open ? (
        <div className="period-select__menu card card--elevated" role="listbox" id={listId}>
          {options.map((option, index) => {
            const active = isSelected(option, selected);
            return (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={active}
                className={`period-select__option ${active ? 'period-select__option--active' : ''}`}
                onClick={() => {
                  onSelected(option);
                  setOpen(false);
                }}
              >
                {labelFor(option)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function recordPeriodOptions(locale: string, t: (key: TranslationKey, params?: Record<string, string>) => string) {
  const now = Date.now();
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);

  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const rangeStart = new Date(year, month, 1).getTime();
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(rangeStart));
    const key = `month:${year}-${String(month + 1).padStart(2, '0')}`;
    months.push({ key, label });
    d.setMonth(d.getMonth() - 1);
  }

  return [
    { key: 'this_month' as const, label: t('recordPeriodThisMonth') },
    ...months.filter((m) => m.key !== `month:${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}`),
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(open, sheetRef, close);
  const allTime = options.find((o) => o.storageKey === 'all_time');
  const months = options.filter((o) => o.storageKey !== 'all_time');

  return (
    <>
      <button type="button" className="period-picker" onClick={() => setOpen(true)}>
        <span className="period-picker__icon" aria-hidden>
          <IconCalendar width={20} height={20} />
        </span>
        <span className="period-picker__copy">
          <span className="period-picker__eyebrow">{t('periodPickerLabel')}</span>
          <span className="period-picker__value">{selectedLabel}</span>
        </span>
        <IconChevronDown width={18} height={18} className="period-picker__chevron" />
      </button>

      {open ? (
        <div className="overlay" onClick={close} role="presentation">
          <div
            ref={sheetRef}
            className="sheet period-picker-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('periodPickerTitle')}
            tabIndex={-1}
          >
            <div className="period-picker-sheet__header">
              <h2>{t('periodPickerTitle')}</h2>
              <p>{t('periodPickerSubtitle')}</p>
            </div>

            {allTime ? (
              <button
                type="button"
                className={`period-picker-option period-picker-option--prominent ${selectedKey === allTime.storageKey ? 'period-picker-option--active' : ''}`}
                onClick={() => {
                  onSelected(allTime);
                  close();
                }}
              >
                <span className="period-picker-option__icon" aria-hidden>
                  <IconHistory width={18} height={18} />
                </span>
                <span className="period-picker-option__label">{t('periodAllTime')}</span>
                {selectedKey === allTime.storageKey ? <IconCheck width={18} height={18} /> : null}
              </button>
            ) : null}

            {months.length > 0 ? (
              <>
                <div className="section-title">{t('periodPickerMonths')}</div>
                <div className="settings-group period-picker-sheet__months">
                  {months.map((option) => {
                    const active = option.storageKey === selectedKey;
                    return (
                      <button
                        key={option.storageKey}
                        type="button"
                        className={`period-picker-option ${active ? 'period-picker-option--active' : ''}`}
                        onClick={() => {
                          onSelected(option);
                          close();
                        }}
                      >
                        <span className="period-picker-option__icon" aria-hidden>
                          <IconCalendar width={18} height={18} />
                        </span>
                        <span className="period-picker-option__label">{option.label}</span>
                        {active ? <IconCheck width={18} height={18} /> : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
