import { useEffect, useId, useRef, useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconCalendar, IconCheck, IconChevronDown, IconClose, IconHistory } from '@/components/Icons';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import type { AnalyticsPeriodOption } from '@/models/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { initialListboxIndex, isListboxNavigationKey, nextListboxIndex } from '@/utils/listbox';

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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();
  const labelId = `${listId}-label`;
  const valueId = `${listId}-value`;

  const selectedIndex = options.findIndex((option) => isSelected(option, selected));

  /** Close without choosing anything and give focus back to the trigger. */
  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openAtSelected = useCallback(() => {
    const index = initialListboxIndex(selectedIndex, options.length);
    if (index === null) return;
    setActiveIndex(index);
    setOpen(true);
  }, [selectedIndex, options.length]);

  const choose = useCallback(
    (option: T) => {
      onSelected(option);
      closeAndRestoreFocus();
    },
    [onSelected, closeAndRestoreFocus],
  );

  // Pointer dismissal. Focus is deliberately not moved: the click lands on whatever the user
  // actually pressed, and stealing focus back to the trigger would undo that.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Opening moves focus into the popup, onto the selected option. Without this the widget is
  // only *named* like a listbox: a keyboard user would still be sitting on the trigger with the
  // arrow keys having nothing to move (caught by e2e/periodSelector.spec.ts).
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
    // Intentionally only on the open transition; later moves are driven by onWidgetKeyDown,
    // which focuses explicitly as it updates activeIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // WAI-ARIA listbox: focus moves into the popup, so a document-level Escape handler would
  // also fire while the user is elsewhere. The handler lives on the widget instead.
  const onWidgetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const { key } = event;
    if (key === 'Escape') {
      // Close without changing the selection; the trigger keeps focus.
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }
    if (key === 'Tab') {
      // A popup listbox must not swallow Tab: hand focus back to the trigger and let the
      // browser continue from there, so the next tab stop is the one after the widget.
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (isListboxNavigationKey(key)) {
      const next = nextListboxIndex(key, activeIndex, options.length);
      if (next === null) return;
      event.preventDefault();
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
    }
    // Enter/Space are left to the option button's native activation.
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openAtSelected();
  };

  return (
    <div className="period-select" ref={rootRef} onKeyDown={onWidgetKeyDown}>
      <span id={labelId} className="sr-only">
        {t('periodSelectorLabel')}
      </span>
      <button
        type="button"
        ref={triggerRef}
        className={`period-select__trigger${open ? ' period-select__trigger--open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => {
          if (open) setOpen(false);
          else openAtSelected();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="period-select__leading" aria-hidden>
          <IconCalendar width={18} height={18} />
        </span>
        <span id={valueId} className="period-select__label">{labelFor(selected)}</span>
        <IconChevronDown
          width={16}
          height={16}
          className={`period-select__chevron${open ? ' period-select__chevron--open' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="period-select__menu card card--elevated" role="listbox" id={listId} aria-labelledby={labelId}>
          {options.map((option, index) => {
            const active = isSelected(option, selected);
            return (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={active}
                // Roving tab index: exactly one option is reachable with Tab — the active
                // one — and the arrow keys move both focus and the active index together.
                tabIndex={index === activeIndex ? 0 : -1}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                className={`period-select__option${active ? ' period-select__option--active' : ''}`}
                onClick={() => choose(option)}
              >
                <span className="period-select__option-label">{labelFor(option)}</span>
                {active ? (
                  <IconCheck width={16} height={16} strokeWidth={2.75} className="period-select__option-check" aria-hidden />
                ) : null}
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
  const titleId = useId();
  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(open, sheetRef, close);
  useBodyScrollLock(open);
  const allTime = options.find((o) => o.storageKey === 'all_time');
  const months = options.filter((o) => o.storageKey !== 'all_time');

  const sheet = open ? (
    <div className="overlay overlay--period" onClick={close} role="presentation">
      <div
        ref={sheetRef}
        className="sheet period-picker-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="period-picker-sheet__grab" aria-hidden />

        <div className="period-picker-sheet__header">
          <div className="period-picker-sheet__heading">
            <h2 id={titleId}>{t('periodPickerTitle')}</h2>
            <p>{t('periodPickerSubtitle')}</p>
          </div>
          <button
            type="button"
            className="period-picker-sheet__close"
            onClick={close}
            aria-label={t('actionClose')}
          >
            <IconClose width={18} height={18} aria-hidden />
          </button>
        </div>

        <div className="period-picker-sheet__body">
          {allTime ? (
            <button
              type="button"
              className={`period-picker-option period-picker-option--prominent ${selectedKey === allTime.storageKey ? 'period-picker-option--active' : ''}`}
              onClick={() => {
                onSelected(allTime);
                close();
              }}
            >
              <span className="period-picker-option__icon period-picker-option__icon--history" aria-hidden>
                <IconHistory width={18} height={18} />
              </span>
              <span className="period-picker-option__label">{t('periodAllTime')}</span>
              {selectedKey === allTime.storageKey ? (
                <span className="period-picker-option__check" aria-hidden>
                  <IconCheck width={16} height={16} strokeWidth={2.75} />
                </span>
              ) : null}
            </button>
          ) : null}

          {months.length > 0 ? (
            <div className="period-picker-sheet__section">
              <div className="period-picker-sheet__section-title">{t('periodPickerMonths')}</div>
              <div className="period-picker-sheet__months">
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
                        <IconCalendar width={16} height={16} />
                      </span>
                      <span className="period-picker-option__label">{option.label}</span>
                      {active ? (
                        <span className="period-picker-option__check" aria-hidden>
                          <IconCheck width={16} height={16} strokeWidth={2.75} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className="period-picker" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="period-picker__icon" aria-hidden>
          <IconCalendar width={20} height={20} />
        </span>
        <span className="period-picker__copy">
          <span className="period-picker__eyebrow">{t('periodPickerLabel')}</span>
          <span className="period-picker__value">{selectedLabel}</span>
        </span>
        <IconChevronDown width={18} height={18} className="period-picker__chevron" />
      </button>

      {typeof document !== 'undefined' && sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
