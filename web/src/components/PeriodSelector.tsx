import { strings } from '@/i18n/en';

interface PremiumPeriodSelectorProps<T> {
  options: T[];
  selected: T;
  labelFor: (item: T) => string;
  isSelected?: (a: T, b: T) => boolean;
  onSelected: (item: T) => void;
}

export function PremiumPeriodSelector<T>({ options, selected, labelFor, isSelected = (a, b) => a === b, onSelected }: PremiumPeriodSelectorProps<T>) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <details className="period-details">
        <summary className="pill-selector">{labelFor(selected)} ▾</summary>
        <div
          className="card card--elevated"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 200,
            zIndex: 50,
            padding: '8px 0',
            borderRadius: 16,
          }}
        >
          {options.map((option, index) => {
            const active = isSelected(option, selected);
            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  onSelected(option);
                  (document.activeElement as HTMLElement)?.blur();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: active ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-on-background)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {labelFor(option)}
              </button>
            );
          })}
        </div>
      </details>
      <style>{`
        .period-details > summary { list-style: none; cursor: pointer; }
        .period-details > summary::-webkit-details-marker { display: none; }
        .period-details:not([open]) > div { display: none; }
      `}</style>
    </div>
  );
}

export function PeriodLabels() {
  return null;
}

export function recordPeriodOptions() {
  return [
    { key: 'this_month' as const, label: strings.recordPeriodThisMonth },
    { key: 'all_time' as const, label: strings.recordPeriodAllTime },
  ];
}
