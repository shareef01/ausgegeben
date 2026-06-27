interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface IosSegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Applied to the active segment button for type-specific tinting */
  activeVariant?: 'default' | 'expense' | 'income' | 'transfer';
}

export function IosSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: IosSegmentedControlProps<T>) {
  return (
    <div className={`ios-segmented ${className}`.trim()} role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-segment={option.value}
            className={`ios-segmented__item ${active ? 'ios-segmented__item--active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
