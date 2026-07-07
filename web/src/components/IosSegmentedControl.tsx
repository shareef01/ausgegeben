import { useRef, type KeyboardEvent } from 'react';

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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusSegment = (index: number) => {
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = index < last ? index + 1 : 0;
      onChange(options[next].value);
      focusSegment(next);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = index > 0 ? index - 1 : last;
      onChange(options[prev].value);
      focusSegment(prev);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(options[0].value);
      focusSegment(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(options[last].value);
      focusSegment(last);
    }
  };

  return (
    <div className={`ios-segmented ${className}`.trim()} role="tablist">
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => { buttonRefs.current[index] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-segment={option.value}
            className={`ios-segmented__item ${active ? 'ios-segmented__item--active' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
