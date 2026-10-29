import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from '@/i18n';
import { formatAmount, formatAxisAmount } from '@/utils/currency';
import { applyCss } from '@/utils/cssVars';
import { usePreferencesStore } from '@/services/preferencesStore';

interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

interface CashFlowChartProps {
  trend: CashFlowPoint[];
  currency?: string;
}

// The SVG is drawn at its real pixel width (measured), not scaled from a fixed 400-wide
// viewBox: scaling shrank 11px labels to ~8px on a 320px phone, and the old 320px min-width
// made the card scroll sideways there.
const DEFAULT_WIDTH = 400;
const CHART_HEIGHT = 168;
const PAD_X_RIGHT = 10;
const PAD_Y_TOP = 12;
const PAD_Y_BOTTOM = 28;
const TOP_PADDING_RATIO = 0.15;
const CHART_H = CHART_HEIGHT - PAD_Y_TOP - PAD_Y_BOTTOM;
const LABEL_FONT_PX = 11;
/** Rough advance width of the 11px semibold label font; only used to space labels. */
const LABEL_CHAR_PX = 6.4;
const TOOLTIP_EDGE = 4;

/** Round up to 1/2/2.5/5 × 10ⁿ so the axis shows "€2K", not "€1,873". */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * base;
}

function polylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const cpx = (from.x + to.x) / 2;
    d += ` C ${cpx} ${from.y}, ${cpx} ${to.y}, ${to.x} ${to.y}`;
  }
  return d;
}

function areaPath(points: { x: number; y: number }[], baseY: number): string {
  if (points.length === 0) return '';
  const line = polylinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

function CashFlowSeries({
  points,
  color,
  gradId,
  baseY,
}: {
  points: { x: number; y: number }[];
  color: string;
  gradId: string;
  baseY: number;
}) {
  const line = polylinePath(points);
  if (!line) return null;

  const last = points[points.length - 1];

  return (
    <g>
      <path d={areaPath(points, baseY)} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length === 1 && (
        <>
          <circle cx={last.x} cy={last.y} r={4} fill={color} />
          <circle cx={last.x} cy={last.y} r={2} fill="var(--color-surface)" />
        </>
      )}
      {/* Anchor the eye on the latest value with a ringed endpoint marker. */}
      {points.length > 1 && (
        <>
          <circle cx={last.x} cy={last.y} r={4.5} fill="var(--color-surface)" />
          <circle cx={last.x} cy={last.y} r={3} fill={color} />
        </>
      )}
    </g>
  );
}

export function CashFlowChart({ trend, currency = 'EUR' }: CashFlowChartProps) {
  const { t } = useTranslation();
  const locale = usePreferencesStore((s) => s.locale);
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;
  const hintId = `cf-hint-${uid}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hasData = trend.length > 0;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!hasData || !el) return;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The plot only mounts once there is data; measure again when it appears.
  }, [hasData]);

  const geometry = useMemo(() => {
    const values = trend.flatMap((p) => [p.income, p.expense]);
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    // Floor of 10 so an empty or cents-only period gets distinct ticks ("$10 · $5 · $0"),
    // not "$1 · $1 · $0" from rounding 0.5.
    const top = niceCeil(Math.max(rawMax * (1 + TOP_PADDING_RATIO), 10));
    const bottom = rawMin < 0 ? -niceCeil(-rawMin * (1 + TOP_PADDING_RATIO)) : 0;
    const tickValues = bottom < 0 ? [top, 0, bottom] : [top, top / 2, 0];
    const tickLabels = tickValues.map((v) => formatAxisAmount(v, currency, locale));
    const padLeft = Math.min(
      96,
      Math.max(36, Math.ceil(Math.max(...tickLabels.map((l) => l.length)) * LABEL_CHAR_PX) + 10),
    );
    const chartW = Math.max(width - padLeft - PAD_X_RIGHT, 1);
    const yFor = (v: number) => PAD_Y_TOP + CHART_H * (1 - (v - bottom) / (top - bottom));
    const xFor = (i: number) =>
      trend.length <= 1 ? padLeft + chartW / 2 : padLeft + (i / (trend.length - 1)) * chartW;

    const incomePts = trend.map((p, i) => ({ x: xFor(i), y: yFor(p.income) }));
    const expensePts = trend.map((p, i) => ({ x: xFor(i), y: yFor(p.expense) }));
    const yTicks = tickValues.map((v, i) => ({ y: yFor(v), label: tickLabels[i], zero: v === 0 }));

    // Labels are spaced by their own measured length, so long month names ("Sept. 2026")
    // drop out rather than overprint each other. The first and last always stay.
    const gap = Math.max(...trend.map((p) => p.label.length), 3) * LABEL_CHAR_PX + 12;
    const xLabels: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
    const lastIdx = trend.length - 1;
    for (let i = 0; i <= lastIdx; i++) {
      const x = xFor(i);
      const prev = xLabels[xLabels.length - 1];
      const isLast = i === lastIdx && lastIdx > 0;
      if (prev && x - prev.x < gap) {
        if (isLast) xLabels[xLabels.length - 1] = { x, label: trend[i].label, anchor: 'middle' };
        continue;
      }
      xLabels.push({ x, label: trend[i].label, anchor: 'middle' });
    }
    // Keep end labels inside the plot instead of half outside the SVG.
    if (xLabels.length > 0 && trend.length > 1) {
      xLabels[0].anchor = 'start';
      if (xLabels.length > 1) xLabels[xLabels.length - 1].anchor = 'end';
    }

    return { incomePts, expensePts, yTicks, xLabels, padLeft, zeroY: yFor(0), chartW };
  }, [trend, currency, locale, width]);

  const ariaSummary = useMemo(() => {
    const totalIncome = trend.reduce((s, p) => s + p.income, 0);
    const totalExpense = trend.reduce((s, p) => s + p.expense, 0);
    return `${t('chartCashFlow')}. ${t('filterIncome')}: ${formatAmount(totalIncome, currency, true, locale)}. ${t('filterExpense')}: ${formatAmount(totalExpense, currency, true, locale)}.`;
  }, [trend, t, currency, locale]);

  if (trend.length === 0) return null;

  const { incomePts, expensePts, yTicks, xLabels, padLeft, zeroY, chartW } = geometry;

  const indexAt = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || trend.length === 1) return 0;
    const px = clientX - rect.left;
    return Math.max(0, Math.min(trend.length - 1, Math.round(((px - padLeft) / chartW) * (trend.length - 1))));
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => setHoverIdx(indexAt(e.clientX));
  // Touch lifts fire pointerleave right away; keep the readout until the next interaction
  // so a tapped value can actually be read.
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse') setHoverIdx(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = trend.length - 1;
    const current = hoverIdx ?? last;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(last, current + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape' && hoverIdx !== null) {
      e.preventDefault();
      setHoverIdx(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setHoverIdx(next);
  };

  const point = hoverIdx !== null ? trend[hoverIdx] : null;

  return (
    <div className="cashflow-chart">
      <div
        ref={wrapRef}
        className="cashflow-chart__plot"
        tabIndex={0}
        role="group"
        aria-label={ariaSummary}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onFocus={() => setHoverIdx((idx) => idx ?? trend.length - 1)}
        onBlur={() => setHoverIdx(null)}
      >
        <span id={hintId} className="sr-only">{t('chartKeyboardHint')}</span>
        <svg
          className="cashflow-chart__svg"
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          aria-hidden
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <defs>
            <linearGradient id={incomeGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-income)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-income)" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, index) => (
            <g key={index}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={width - PAD_X_RIGHT}
                y2={tick.y}
                stroke="var(--color-on-surface)"
                strokeOpacity={tick.zero ? '0.2' : '0.08'}
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={tick.y + 3.5}
                textAnchor="end"
                fill="var(--color-on-surface-variant)"
                fontSize={LABEL_FONT_PX}
                fontFamily="var(--font-family, Inter, sans-serif)"
                fontWeight="600"
              >
                {tick.label}
              </text>
            </g>
          ))}

          <CashFlowSeries points={incomePts} color="var(--color-income)" gradId={incomeGradId} baseY={zeroY} />
          <CashFlowSeries points={expensePts} color="var(--color-expense)" gradId={expenseGradId} baseY={zeroY} />

          {hoverIdx !== null && incomePts[hoverIdx] ? (
            <g pointerEvents="none">
              <line
                x1={incomePts[hoverIdx].x}
                y1={PAD_Y_TOP}
                x2={incomePts[hoverIdx].x}
                y2={PAD_Y_TOP + CHART_H}
                stroke="var(--color-on-surface)"
                strokeOpacity="0.25"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {[
                { pt: incomePts[hoverIdx], color: 'var(--color-income)' },
                { pt: expensePts[hoverIdx], color: 'var(--color-expense)' },
              ].map(({ pt, color }, i) => (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y} r={5} fill="var(--color-surface)" />
                  <circle cx={pt.x} cy={pt.y} r={3.25} fill={color} />
                </g>
              ))}
            </g>
          ) : null}

          {xLabels.map((lbl, i) => (
            <text
              key={i}
              x={lbl.x}
              y={CHART_HEIGHT - 8}
              textAnchor={lbl.anchor}
              fill="var(--color-on-surface-variant)"
              fontSize={LABEL_FONT_PX}
              fontFamily="var(--font-family, Inter, sans-serif)"
              fontWeight="600"
            >
              {lbl.label}
            </text>
          ))}
        </svg>

        {point && hoverIdx !== null ? (
          <CashFlowTooltip
            anchorX={incomePts[hoverIdx].x}
            containerWidth={width}
            label={point.label}
            income={formatAmount(point.income, currency, true, locale)}
            expense={formatAmount(point.expense, currency, true, locale)}
            incomeLabel={t('filterIncome')}
            expenseLabel={t('filterExpense')}
          />
        ) : null}
      </div>

      {/* Exact figures without reading a graph: every period, both series and the net. */}
      <details className="cashflow-table">
        <summary className="cashflow-table__summary">{t('chartShowValues')}</summary>
        <div className="cashflow-table__scroll">
          <table className="cashflow-table__table tabular-nums">
            <thead>
              <tr>
                <th scope="col">{t('chartPeriodColumn')}</th>
                <th scope="col">{t('filterIncome')}</th>
                <th scope="col">{t('filterExpense')}</th>
                <th scope="col">{t('billsNet')}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{p.label}</th>
                  <td data-label={t('filterIncome')}>{formatAmount(p.income, currency, true, locale)}</td>
                  <td data-label={t('filterExpense')}>{formatAmount(p.expense, currency, true, locale)}</td>
                  <td data-label={t('billsNet')}>{formatAmount(p.income - p.expense, currency, true, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function CashFlowTooltip({
  anchorX,
  containerWidth,
  label,
  income,
  expense,
  incomeLabel,
  expenseLabel,
}: {
  anchorX: number;
  containerWidth: number;
  label: string;
  income: string;
  expense: string;
  incomeLabel: string;
  expenseLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Centre on the point, then clamp by the tooltip's real width so it never pokes out of the
  // card (the old percentage thresholds clipped at 320px with long CHF/German amounts).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(TOOLTIP_EDGE, anchorX - w / 2), Math.max(TOOLTIP_EDGE, containerWidth - w - TOOLTIP_EDGE));
    applyCss(el, { '--tooltip-left': `${left}px` });
  }, [anchorX, containerWidth, label, income, expense]);

  return (
    <div ref={ref} className="cashflow-tooltip" role="status">
      <div className="cashflow-tooltip__label">{label}</div>
      <div className="cashflow-tooltip__row">
        <span className="cashflow-tooltip__dot cashflow-tooltip__dot--income" aria-hidden />
        <span className="cashflow-tooltip__name">{incomeLabel}</span>
        <span className="cashflow-tooltip__value">{income}</span>
      </div>
      <div className="cashflow-tooltip__row">
        <span className="cashflow-tooltip__dot cashflow-tooltip__dot--expense" aria-hidden />
        <span className="cashflow-tooltip__name">{expenseLabel}</span>
        <span className="cashflow-tooltip__value">{expense}</span>
      </div>
    </div>
  );
}

export function CashFlowLegend() {
  const { t } = useTranslation();
  return (
    <div className="cashflow-legend" role="list" aria-label={t('chartCashFlow')}>
      <span className="cashflow-legend__item" role="listitem">
        <span className="cashflow-legend__dot cashflow-legend__dot--income" aria-hidden />
        <span className="cashflow-legend__label">{t('filterIncome')}</span>
      </span>
      <span className="cashflow-legend__item" role="listitem">
        <span className="cashflow-legend__dot cashflow-legend__dot--expense" aria-hidden />
        <span className="cashflow-legend__label">{t('filterExpense')}</span>
      </span>
    </div>
  );
}
