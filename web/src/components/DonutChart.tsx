import { useMemo, useId } from 'react';
import { colorIntToHex } from '@/utils/currency';
import { useTranslation } from '@/i18n';
import { useCssProps } from '@/utils/cssVars';

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

const STROKE = 16;
/** Gap between segments (user units). Butt caps + gap = clean pie seams. */
const GAP = 3.5;
/** Seconds for the draw "pen" to travel the full ring on first paint. */
const SWEEP = 0.75;

function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => {
    if (amount >= 0) return Math.round(c + (255 - c) * amount);
    return Math.round(c * (1 + amount));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function DonutSegCircle({
  cx,
  cy,
  r,
  stroke,
  segLen,
  segC,
  offset,
  title,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: string;
  segLen: number;
  segC: number;
  offset: number;
  title: string;
}) {
  const ref = useCssProps<SVGCircleElement>({
    '--seg-len': segLen,
    '--seg-c': segC,
    animationDelay: `${(offset / segC) * SWEEP}s`,
    animationDuration: `${Math.max((segLen / segC) * SWEEP, 0.05)}s`,
  });

  return (
    <circle
      ref={ref}
      className="donut__seg"
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth={STROKE}
      strokeDasharray={`${segLen} ${segC}`}
      strokeDashoffset={-offset}
      strokeLinecap="butt"
    >
      <title>{title}</title>
    </circle>
  );
}

export function DonutChart({ segments, size = 140, center }: DonutChartProps) {
  const { t } = useTranslation();
  const uid = useId().replace(/:/g, '');
  const wrapRef = useCssProps<HTMLDivElement>({ '--donut-size': `${size}px` });
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
      // Tiny slices keep a visible speck; larger ones honor the gap.
      const visible = dash < GAP * 2 ? Math.max(dash * 0.92, 1.5) : Math.max(dash - GAP, 1);
      return { color: seg.color, dash, visible, offset };
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
    <div ref={wrapRef} className="donut-wrap">
      <svg width={size} height={size} className="donut" role="img" aria-label={ariaLabel}>
        <defs>
          {arcs.map((p, i) => (
            <linearGradient key={i} id={`dg-${uid}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={shadeHex(p.color, 0.22)} />
              <stop offset="48%" stopColor={p.color} />
              <stop offset="100%" stopColor={shadeHex(p.color, -0.18)} />
            </linearGradient>
          ))}
          <filter id={`dg-glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {total <= 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-outline)" strokeWidth={STROKE} opacity={0.28} />
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
              opacity={0.22}
            />
            <circle
              className="donut__track-inner"
              cx={size / 2}
              cy={size / 2}
              r={r - STROKE / 2 - 1.5}
              fill="none"
              stroke="var(--color-outline)"
              strokeWidth={1}
              opacity={0.18}
            />
            <g className="donut__ring" filter={`url(#dg-glow-${uid})`}>
              {arcs.map((p, i) => (
                <DonutSegCircle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={`url(#dg-${uid}-${i})`}
                  segLen={p.visible}
                  segC={c}
                  offset={p.offset}
                  title={`${segments[i].label}: ${Math.round((segments[i].value / Math.max(total, 1)) * 100)}%`}
                />
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

/** Fallback palette when a category has no usable color. */
const CHART_FALLBACK = [
  '#E07A7A', '#5CB88A', '#5B9FE0', '#9B86E8',
  '#E0A85C', '#4DB8A8', '#D47A9A', '#C4A05A',
];

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Category color tuned for chart surfaces: lift muddy pastels on dark UI;
 * keep deeper, less neon strokes on light UI.
 */
export function segmentColor(colorInt: number, fallbackIndex = 0): string {
  const hex = colorIntToHex(colorInt);
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return CHART_FALLBACK[fallbackIndex % CHART_FALLBACK.length];
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = relativeLuminance(r, g, b);
  if (lum < 0.08) return CHART_FALLBACK[fallbackIndex % CHART_FALLBACK.length];

  const { h, s, l } = rgbToHsl(r, g, b);
  const isLight =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  if (isLight) {
    const s2 = Math.min(0.7, Math.max(0.36, s * 1.12));
    const l2 = Math.min(0.5, Math.max(0.3, l < 0.42 ? l + 0.04 : l * 0.86));
    return hslToHex(h, s2, l2);
  }
  // Pastel category swatches → richer chart strokes on OLED/dark surfaces
  const s2 = Math.min(0.78, Math.max(0.42, s * 1.45 + 0.12));
  const l2 = Math.min(0.64, Math.max(0.44, l < 0.45 ? l + 0.12 : l * 0.92 + 0.04));
  return hslToHex(h, s2, l2);
}
