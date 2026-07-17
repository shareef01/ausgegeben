import { useMemo, useId } from 'react';
import { colorIntToHex } from '@/utils/currency';
import { useTranslation } from '@/i18n';

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
  const { t } = useTranslation();
  const uid = useId().replace(/:/g, '');
  const { total, paths, r, c, summary } = useMemo(() => {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const stroke = 12;
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

    const summary = segments
      .filter((s) => s.value > 0)
      .map((s) => `${s.label}: ${Math.round((s.value / Math.max(total, 1)) * 100)}%`)
      .join(', ');

    return { total, paths, r, c, summary };
  }, [segments, size]);

  const ariaLabel = center?.value
    ? `${t('chartCategoryBreakdown')}. ${center.label ? `${center.label} ` : ''}${center.value}${summary ? `. ${summary}` : ''}`
    : t('chartCategoryBreakdown');

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut" role="img" aria-label={ariaLabel}>
        <defs>
          {paths.map((p, i) => (
            <linearGradient key={i} id={`dg-${uid}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.8} />
              <stop offset="50%" stopColor={p.color} stopOpacity={1} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0.8} />
            </linearGradient>
          ))}
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
                stroke={`url(#dg-${uid}-${i})`}
                strokeWidth={12}
                strokeDasharray={`${Math.max(p.dash - 2, 1)} ${c}`}
                strokeDashoffset={-p.offset}
                strokeLinecap="round"
              />
            ))}
          </>
        )}
      </svg>
      {center ? (
        <div className="donut-center">
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
