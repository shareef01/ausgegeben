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
  const pillVariant =
    activeVariant !== 'default'
      ? activeVariant
      : value === 'expense' || value === 'income' || value === 'transfer'
        ? value
        : 'default';

  return (
    <div className={`segmented ${className}`.trim()} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
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
