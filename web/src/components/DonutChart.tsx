import { colorIntToHex } from '@/utils/currency';

interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  compact?: boolean;
  centerLabel?: string;
}

export function DonutChart({ segments, size = 140, compact = false, centerLabel }: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (total <= 0) {
    return (
      <div className="donut-wrap">
        <svg width={size} height={size} className="donut">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={stroke} opacity={0.25} />
        </svg>
      </div>
    );
  }

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} className="donut" role="img" aria-label="Category breakdown chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={stroke} opacity={0.18} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = c * frac;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(dash - 2, 1)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {!compact && centerLabel ? (
        <div style={{ position: 'absolute', textAlign: 'center', fontWeight: 600 }}>{centerLabel}</div>
      ) : null}
    </div>
  );
}

export function segmentColor(colorInt: number): string {
  return colorIntToHex(colorInt);
}
