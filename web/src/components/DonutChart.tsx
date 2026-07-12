import { useMemo } from 'react';
import { colorIntToHex } from '@/utils/currency';

export interface DonutCenterSummary {
  /** Optional muted label above the value (e.g. "Total") */
  label?: string;
  /** Bold centered sum — primary visual summary */
  value: string;
}

interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  center?: DonutCenterSummary;
}

export function DonutChart({ segments, size = 140, center }: DonutChartProps) {
  const { total, paths, r, c } = useMemo(() => {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const stroke = 12; // Law: Refined slim stroke
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    let currentOffset = 0;
    const paths = segments.map((seg) => {
      const frac = seg.value / total;
      const dash = c * frac;
      const offset = currentOffset;
      currentOffset += dash;
      return { color: seg.color, dash, offset };
    });

    return { total, paths, r, c };
  }, [segments, size]);

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut" role="img" aria-label="Category breakdown chart">
        <defs>
          <filter id="donut-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--color-on-background)" floodOpacity="0.08" />
          </filter>
        </defs>
        {total <= 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={12} opacity={0.25} />
        ) : (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={12} opacity={0.18} />
            {paths.map((p, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={12}
                strokeDasharray={`${Math.max(p.dash - 2, 1)} ${c}`}
                strokeDashoffset={-p.offset}
                strokeLinecap="round"
                filter="url(#donut-glow)"
              />
            ))}
          </>
        )}
      </svg>
      {center ? (
        <div className="donut-center" aria-hidden>
          {center.label ? <span className="donut-center__label">{center.label}</span> : null}
          <span className="donut-center__value">{center.value}</span>
        </div>
      ) : null}
    </div>
  );
}

export function segmentColor(colorInt: number): string {
  return colorIntToHex(colorInt);
}
