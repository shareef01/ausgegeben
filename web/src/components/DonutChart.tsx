import { useMemo, useId, type CSSProperties } from 'react';
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

const STROKE = 13;
/** Gap between segments, in user units, carved out of each arc's tail. */
const GAP = 4;
/** Seconds for the draw "pen" to travel the full ring on first paint. */
const SWEEP = 0.7;

export function DonutChart({ segments, size = 140, center }: DonutChartProps) {
  const { t } = useTranslation();
  const uid = useId().replace(/:/g, '');
  const { total, arcs, r, c, summary } = useMemo(() => {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const r = (size - STROKE) / 2;
    const c = 2 * Math.PI * r;

    let currentOffset = 0;
    const arcs = segments.map((seg) => {
      const frac = total > 0 ? seg.value / total : 0;
      const dash = c * frac;
      const offset = currentOffset;
      currentOffset += dash;
      return { color: seg.color, dash, visible: Math.max(dash - GAP, 1), offset };
    });

    const summary = segments
      .filter((s) => s.value > 0)
      .map((s) => `${s.label}: ${Math.round((s.value / Math.max(total, 1)) * 100)}%`)
      .join(', ');

    return { total, arcs, r, c, summary };
  }, [segments, size]);

  const ariaLabel = center?.value
    ? `${t('chartCategoryBreakdown')}. ${center.label ? `${center.label} ` : ''}${center.value}${summary ? `. ${summary}` : ''}`
    : t('chartCategoryBreakdown');

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut" role="img" aria-label={ariaLabel}>
        <defs>
          {arcs.map((p, i) => (
            <linearGradient key={i} id={`dg-${uid}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.72} />
              <stop offset="55%" stopColor={p.color} stopOpacity={1} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0.85} />
            </linearGradient>
          ))}
        </defs>
        {total <= 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={STROKE} opacity={0.25} />
        ) : (
          <>
            <circle
              className="donut__track"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--color-outline)"
              strokeWidth={STROKE}
              opacity={0.16}
            />
            <g className="donut__ring">
              {arcs.map((p, i) => (
                <circle
                  key={i}
                  className="donut__seg"
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={`url(#dg-${uid}-${i})`}
                  strokeWidth={STROKE}
                  strokeDasharray={`${p.visible} ${c}`}
                  strokeDashoffset={-p.offset}
                  strokeLinecap="round"
                  style={{
                    '--seg-len': p.visible,
                    '--seg-c': c,
                    animationDelay: `${(p.offset / c) * SWEEP}s`,
                    animationDuration: `${Math.max((p.visible / c) * SWEEP, 0.05)}s`,
                  } as CSSProperties}
                >
                  <title>{`${segments[i].label}: ${Math.round((segments[i].value / Math.max(total, 1)) * 100)}%`}</title>
                </circle>
              ))}
            </g>
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
