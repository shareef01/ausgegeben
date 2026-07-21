import { useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from '@/i18n';
import { formatAmount } from '@/utils/currency';

interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

interface CashFlowChartProps {
  trend: CashFlowPoint[];
  currency?: string;
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 168;
const PAD_X_LEFT = 44;
const PAD_X_RIGHT = 10;
const PAD_Y_TOP = 12;
const PAD_Y_BOTTOM = 28;
const TOP_PADDING_RATIO = 0.2;
const CHART_W = CHART_WIDTH - PAD_X_LEFT - PAD_X_RIGHT;
const CHART_H = CHART_HEIGHT - PAD_Y_TOP - PAD_Y_BOTTOM;
const MIN_LABEL_GAP_PX = 48;

function yFor(value: number, minV: number, maxV: number): number {
  const range = Math.max(maxV - minV, 1);
  const paddedMax = maxV + range * TOP_PADDING_RATIO;
  const paddedRange = paddedMax - minV;
  const t = (value - minV) / paddedRange;
  return PAD_Y_TOP + CHART_H * (1 - t);
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PAD_X_LEFT + CHART_W / 2;
  return PAD_X_LEFT + (index / (count - 1)) * CHART_W;
}

function polylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const cp1x = (from.x + to.x) / 2;
    const cp2x = (from.x + to.x) / 2;
    d += ` C ${cp1x} ${from.y}, ${cp2x} ${to.y}, ${to.x} ${to.y}`;
  }
  return d;
}

function areaPath(points: { x: number; y: number }[], bottomY: number): string {
  if (points.length === 0) return '';
  const line = polylinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}

function compactAmount(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return formatAmount(value, currency).replace(/[^\d.,\-]/g, '').slice(0, 8) || String(Math.round(value));
}

function CashFlowSeries({
  points,
  color,
  gradId,
  bottomY,
}: {
  points: { x: number; y: number }[];
  color: string;
  gradId: string;
  bottomY: number;
}) {
  const line = polylinePath(points);
  if (!line) return null;

  const last = points[points.length - 1];

  return (
    <g>
      <path d={areaPath(points, bottomY)} fill={`url(#${gradId})`} />
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
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;
  const bottomY = PAD_Y_TOP + CHART_H;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || trend.length === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const idx = trend.length === 1
      ? 0
      : Math.round(((px - PAD_X_LEFT) / CHART_W) * (trend.length - 1));
    setHoverIdx(Math.max(0, Math.min(trend.length - 1, idx)));
  };
  const onPointerLeave = () => setHoverIdx(null);

  const { incomePts, expensePts, yTicks, ariaSummary } = useMemo(() => {
    const values = trend.flatMap((p) => [p.income, p.expense]);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(...values, 1);

    const incomePts = trend.map((p, i) => ({
      x: xFor(i, trend.length),
      y: yFor(p.income, minV, maxV),
    }));
    const expensePts = trend.map((p, i) => ({
      x: xFor(i, trend.length),
      y: yFor(p.expense, minV, maxV),
    }));

    const yTicks = [0, 0.5, 1].map((tVal) => {
      const range = Math.max(maxV - minV, 1);
      const paddedMax = maxV + range * TOP_PADDING_RATIO;
      const valueAt = paddedMax - tVal * (paddedMax - minV);
      return {
        y: PAD_Y_TOP + CHART_H * tVal,
        label: compactAmount(valueAt, currency),
      };
    });

    const totalIncome = trend.reduce((s, p) => s + p.income, 0);
    const totalExpense = trend.reduce((s, p) => s + p.expense, 0);
    const ariaSummary = `${t('chartCashFlow')}. ${t('filterIncome')}: ${formatAmount(totalIncome, currency)}. ${t('filterExpense')}: ${formatAmount(totalExpense, currency)}.`;

    return { incomePts, expensePts, yTicks, ariaSummary };
  }, [trend, t, currency]);

  const xLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    let lastX = -Infinity;
    let lastLabel = '';
    for (let i = 0; i < trend.length; i++) {
      const px = xFor(i, trend.length);
      const lbl = trend[i].label;
      if (px - lastX >= MIN_LABEL_GAP_PX && lbl !== lastLabel) {
        labels.push({ x: px, label: lbl });
        lastX = px;
        lastLabel = lbl;
      } else if (i === 0) {
        labels.push({ x: px, label: lbl });
        lastX = px;
        lastLabel = lbl;
      }
    }
    if (trend.length > 1) {
      const lastPx = xFor(trend.length - 1, trend.length);
      const lastLbl = trend[trend.length - 1].label;
      const prevLabel = labels[labels.length - 1];
      if (!prevLabel || (lastPx - prevLabel.x >= MIN_LABEL_GAP_PX && lastLbl !== prevLabel.label)) {
        labels.push({ x: lastPx, label: lastLbl });
      } else if (prevLabel && lastLbl !== prevLabel.label) {
        labels[labels.length - 1] = { x: lastPx, label: lastLbl };
      }
    }
    return labels;
  }, [trend]);

  if (trend.length === 0) return null;

  return (
    <div className="cashflow-chart">
      <svg
        ref={svgRef}
        className="cashflow-chart__svg"
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaSummary}
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
              x1={PAD_X_LEFT}
              y1={tick.y}
              x2={CHART_WIDTH - PAD_X_RIGHT}
              y2={tick.y}
              stroke="var(--color-on-surface)"
              strokeOpacity={index === yTicks.length - 1 ? '0.2' : '0.08'}
              strokeWidth={1}
            />
            <text
              x={PAD_X_LEFT - 6}
              y={tick.y + 3.5}
              textAnchor="end"
              fill="var(--color-on-surface-variant)"
              fontSize="11"
              fontFamily="var(--font-family, Inter, sans-serif)"
              fontWeight="600"
            >
              {tick.label}
            </text>
          </g>
        ))}

        <CashFlowSeries points={incomePts} color="var(--color-income)" gradId={incomeGradId} bottomY={bottomY} />
        <CashFlowSeries points={expensePts} color="var(--color-expense)" gradId={expenseGradId} bottomY={bottomY} />

        {hoverIdx !== null && incomePts[hoverIdx] ? (
          <g pointerEvents="none">
            <line
              x1={incomePts[hoverIdx].x}
              y1={PAD_Y_TOP}
              x2={incomePts[hoverIdx].x}
              y2={bottomY}
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
            textAnchor="middle"
            fill="var(--color-on-surface-variant)"
            fontSize="11"
            fontFamily="var(--font-family, Inter, sans-serif)"
            fontWeight="600"
          >
            {lbl.label}
          </text>
        ))}
      </svg>

      {hoverIdx !== null && trend[hoverIdx] ? (
        <div
          className="cashflow-tooltip"
          role="status"
          style={{
            left: `${(incomePts[hoverIdx].x / CHART_WIDTH) * 100}%`,
            transform: `translateX(${incomePts[hoverIdx].x > CHART_WIDTH * 0.62 ? '-100%' : incomePts[hoverIdx].x < CHART_WIDTH * 0.2 ? '0%' : '-50%'})`,
          }}
        >
          <div className="cashflow-tooltip__label">{trend[hoverIdx].label}</div>
          <div className="cashflow-tooltip__row">
            <span className="cashflow-tooltip__dot cashflow-tooltip__dot--income" aria-hidden />
            <span className="cashflow-tooltip__name">{t('filterIncome')}</span>
            <span className="cashflow-tooltip__value">{formatAmount(trend[hoverIdx].income, currency)}</span>
          </div>
          <div className="cashflow-tooltip__row">
            <span className="cashflow-tooltip__dot cashflow-tooltip__dot--expense" aria-hidden />
            <span className="cashflow-tooltip__name">{t('filterExpense')}</span>
            <span className="cashflow-tooltip__value">{formatAmount(trend[hoverIdx].expense, currency)}</span>
          </div>
        </div>
      ) : null}
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
