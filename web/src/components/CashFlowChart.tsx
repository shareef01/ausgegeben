import { useId, useMemo } from 'react';
import { useTranslation } from '@/i18n';

interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

interface CashFlowChartProps {
  trend: CashFlowPoint[];
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 136;
const PAD_X = 8;
const PAD_Y_TOP = 16;
const PAD_Y_BOTTOM = 16;
// Mandate: 20% vertical padding at top so spikes never hit the ceiling
const TOP_PADDING_RATIO = 0.20;
const CHART_W = CHART_WIDTH - PAD_X * 2;
const CHART_H = CHART_HEIGHT - PAD_Y_TOP - PAD_Y_BOTTOM;
// Pillar 3: Minimum pixel gap between X-axis labels to prevent collision
const MIN_LABEL_GAP_PX = 44;

function yFor(value: number, minV: number, maxV: number): number {
  const range = Math.max(maxV - minV, 1);
  // Expand the max by TOP_PADDING_RATIO of the range to leave headroom
  const paddedMax = maxV + range * TOP_PADDING_RATIO;
  const paddedRange = paddedMax - minV;
  const t = (value - minV) / paddedRange;
  return PAD_Y_TOP + CHART_H * (1 - t);
}

function xFor(index: number, count: number): number {
  if (count <= 1) return PAD_X + CHART_W / 2;
  return PAD_X + (index / (count - 1)) * CHART_W;
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

  return (
    <g>
      <path d={areaPath(points, bottomY)} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={3} // Law: Flagship Bezier weight
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length === 1 && points.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={4} fill={color} />
          <circle cx={pt.x} cy={pt.y} r={2} fill="var(--color-surface)" />
        </g>
      ))}
    </g>
  );
}

export function CashFlowChart({ trend }: CashFlowChartProps) {
  const { t } = useTranslation();
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;
  const bottomY = PAD_Y_TOP + CHART_H;

  const { incomePts, expensePts, ariaSummary } = useMemo(() => {
    const values = trend.flatMap((p) => [p.income, p.expense]);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);

    const incomePts = trend.map((p, i) => ({
      x: xFor(i, trend.length),
      y: yFor(p.income, minV, maxV),
    }));
    const expensePts = trend.map((p, i) => ({
      x: xFor(i, trend.length),
      y: yFor(p.expense, minV, maxV),
    }));

    const totalIncome = trend.reduce((s, p) => s + p.income, 0);
    const totalExpense = trend.reduce((s, p) => s + p.expense, 0);
    const ariaSummary = `${t('chartCashFlow')}. ${t('filterIncome')}: ${totalIncome.toFixed(2)}. ${t('filterExpense')}: ${totalExpense.toFixed(2)}.`;

    return { incomePts, expensePts, ariaSummary };
  }, [trend, t]);

  // Pillar 3: Deduplicate X-axis labels — skip collisions and repeated text
  const xLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    let lastX = -Infinity;
    let lastLabel = '';
    for (let i = 0; i < trend.length; i++) {
      const px = xFor(i, trend.length);
      const lbl = trend[i].label;
      // Only render if far enough from previous AND label differs or is first
      if (px - lastX >= MIN_LABEL_GAP_PX && lbl !== lastLabel) {
        labels.push({ x: px, label: lbl });
        lastX = px;
        lastLabel = lbl;
      } else if (i === 0) {
        // Always show first label
        labels.push({ x: px, label: lbl });
        lastX = px;
        lastLabel = lbl;
      }
    }
    // Always show last label if it would be unique and far enough
    if (trend.length > 1) {
      const lastPx = xFor(trend.length - 1, trend.length);
      const lastLbl = trend[trend.length - 1].label;
      const prevLabel = labels[labels.length - 1];
      if (!prevLabel || (lastPx - prevLabel.x >= MIN_LABEL_GAP_PX && lastLbl !== prevLabel.label)) {
        labels.push({ x: lastPx, label: lastLbl });
      }
    }
    return labels;
  }, [trend]);

  if (trend.length === 0) return null;

  return (
    <div className="cashflow-chart">
      <svg
        className="cashflow-chart__svg"
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaSummary}
      >
        <defs>
          <linearGradient id={incomeGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-income)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-income)" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((index) => {
          const y = PAD_Y_TOP + CHART_H * (index / 3);
          return (
            <line
              key={index}
              x1="0"
              y1={y}
              x2={CHART_WIDTH}
              y2={y}
              stroke="var(--color-on-surface)"
              strokeOpacity="0.03"
              strokeWidth={1}
            />
          );
        })}

        <CashFlowSeries points={incomePts} color="var(--color-income)" gradId={incomeGradId} bottomY={bottomY} />
        <CashFlowSeries points={expensePts} color="var(--color-expense)" gradId={expenseGradId} bottomY={bottomY} />

        {/* Pillar 3: Deduplicated X-axis labels with collision avoidance */}
        {xLabels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={CHART_HEIGHT - 2}
            textAnchor="middle"
            fill="var(--color-on-surface-variant)"
            fillOpacity="0.55"
            fontSize="8.5"
            fontFamily="var(--font-family, Inter, sans-serif)"
            fontWeight="500"
          >
            {lbl.label}
          </text>
        ))}
      </svg>
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
