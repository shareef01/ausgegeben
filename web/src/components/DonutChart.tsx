import { useMemo } from 'react';
import { colorIntToHex } from '@/utils/currency';
import { useChartReveal } from '@/hooks/useChartReveal';

export interface DonutCenterSummary {
  /** Optional muted label above the value (e.g. "Total") */
  label?: string;
  /** Bold centered sum — primary visual summary */
  value: string;
  valueColor?: string;
}

interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  center?: DonutCenterSummary;
  /** When set, re-runs the reveal animation when data changes. */
  animationKey?: string | number;
  animated?: boolean;
}

export function DonutChart({ segments, size = 140, center, animationKey, animated = true }: DonutChartProps) {
  const revealKey = animationKey ?? segments.map((s) => `${s.label}:${s.value}`).join('|');
  const progress = useChartReveal(revealKey, animated);
  const { total, paths, r, c, chartDesc } = useMemo(() => {
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

    const chartDesc = segments.length > 0
      ? `Breakdown chart for ${center?.label || 'total'} ${center?.value || total}. ${segments.map(s => `${s.label}: ${s.value}`).join(', ')}`
      : 'No chart data available';

    return { total, paths, r, c, chartDesc };
  }, [segments, size, center]);

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut" role="img" aria-label={chartDesc}>
        {total <= 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={12} opacity={0.25} />
        ) : (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={12} opacity={0.18} />
            {paths.map((p, i) => {
              const revealedDash = p.dash * progress;
              const gap = 2 * progress;
              return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={12}
                strokeDasharray={`${Math.max(revealedDash - gap, progress > 0 ? 0.5 : 0)} ${c}`}
                strokeDashoffset={-p.offset * progress}
                strokeLinecap="round"
              />
              );
            })}
          </>
        )}
      </svg>
      {center ? (
        <div className="donut-center" aria-hidden style={{ opacity: 0.35 + progress * 0.65 }}>
          {center.label ? <span className="donut-center__label">{center.label}</span> : null}
          <span className="donut-center__value" style={center.valueColor ? { color: center.valueColor } : undefined}>{center.value}</span>
        </div>
      ) : null}
    </div>
  );
}

export function segmentColor(colorInt: number): string {
  return colorIntToHex(colorInt);
}
