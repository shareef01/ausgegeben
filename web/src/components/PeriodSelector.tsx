import { useEffect, useId, useRef, useState } from 'react';
import { IconChevronDown } from '@/components/Icons';
import { useTranslation } from '@/i18n';

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

export function recordPeriodOptions() {
  const { t } = useTranslation();
  return [
    { key: 'this_month' as const, label: t('recordPeriodThisMonth') },
    { key: 'all_time' as const, label: t('recordPeriodAllTime') },
  ];
}
