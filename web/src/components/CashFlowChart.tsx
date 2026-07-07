import { useId, useMemo } from 'react';
import { useChartReveal } from '@/hooks/useChartReveal';
import { useTranslation } from '@/i18n';
interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

interface CashFlowChartProps {
  trend: CashFlowPoint[];
  periodKey?: string;
  ariaLabelledBy?: string;
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 136;
const PAD_X = 8;
const PAD_Y = 16;
const CHART_W = CHART_WIDTH - PAD_X * 2;
const CHART_H = CHART_HEIGHT - PAD_Y * 2;

function yFor(value: number, minV: number, maxV: number): number {
  const range = Math.max(maxV - minV, 1);
  const t = (value - minV) / range;
  return PAD_Y + CHART_H * (1 - t);
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
  progress,
}: {
  points: { x: number; y: number }[];
  color: string;
  gradId: string;
  bottomY: number;
  progress: number;
}) {
  const line = polylinePath(points);
  if (!line) return null;

  return (
    <g opacity={0.2 + progress * 0.8}>
      <path d={areaPath(points, bottomY)} fill={`url(#${gradId})`} opacity={progress} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
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

export function CashFlowChart({ trend, periodKey, ariaLabelledBy }: CashFlowChartProps) {
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;
  const bottomY = PAD_Y + CHART_H;

  const revealKey = useMemo(
    () => `${periodKey ?? ''}|${trend.map((p) => `${p.label}:${p.income}:${p.expense}`).join('|')}`,
    [periodKey, trend],
  );
  const progress = useChartReveal(revealKey);

  const { incomePts, expensePts } = useMemo(() => {
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
    return { incomePts, expensePts };
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
        aria-labelledby={ariaLabelledBy}
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
          const y = PAD_Y + CHART_H * (index / 3);
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

        <CashFlowSeries points={incomePts} color="var(--color-income)" gradId={incomeGradId} bottomY={bottomY} progress={progress} />
        <CashFlowSeries points={expensePts} color="var(--color-expense)" gradId={expenseGradId} bottomY={bottomY} progress={progress} />
      </svg>
    </div>
  );
}

export function CashFlowLegend() {
  const { t } = useTranslation();
  return (
    <div className="cashflow-legend" aria-label={t('billsCashFlow')}>
      <span className="cashflow-legend__dot cashflow-legend__dot--income" />
      <span className="cashflow-legend__dot cashflow-legend__dot--expense" />
    </div>
  );
}
