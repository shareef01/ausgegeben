import { useCallback, useRef, type KeyboardEvent } from 'react';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface IosSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Tint the active pill by transaction type when relevant */
  activeVariant?: 'default' | 'expense' | 'income' | 'transfer';
}

export function IosSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  activeVariant = 'default',
  'aria-label': ariaLabel,
}: IosSegmentedControlProps<T> & { 'aria-label'?: string }) {
  const groupRef = useRef<HTMLDivElement>(null);

  const pillVariant =
    activeVariant !== 'default'
      ? activeVariant
      : value === 'expense' || value === 'income' || value === 'transfer'
        ? value
        : 'default';

  const focusIndex = useCallback((index: number) => {
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[index]?.focus();
  }, []);

  const selectByOffset = useCallback(
    (offset: number) => {
      const current = Math.max(0, options.findIndex((o) => o.value === value));
      const next = (current + offset + options.length) % options.length;
      onChange(options[next].value);
      // Focus after state update paints — requestAnimationFrame is enough for same-tick DOM
      requestAnimationFrame(() => focusIndex(next));
    },
    [focusIndex, onChange, options, value],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        selectByOffset(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        selectByOffset(-1);
        break;
      case 'Home':
        e.preventDefault();
        onChange(options[0].value);
        requestAnimationFrame(() => focusIndex(0));
        break;
      case 'End':
        e.preventDefault();
        onChange(options[options.length - 1].value);
        requestAnimationFrame(() => focusIndex(options.length - 1));
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={groupRef}
      className={`segmented ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-type={option.value}
            className={[
              'segmented__item',
              active ? 'segmented__item--active' : '',
              active ? `segmented__item--${pillVariant}` : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
