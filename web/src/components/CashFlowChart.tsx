import { useId, useMemo } from 'react';

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
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
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
        strokeOpacity={0.22}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={6} fill={color} fillOpacity={0.18} />
          <circle cx={pt.x} cy={pt.y} r={3} fill={color} />
        </g>
      ))}
    </g>
  );
}

export function CashFlowChart({ trend }: CashFlowChartProps) {
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;
  const bottomY = PAD_Y + CHART_H;

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
        aria-hidden
      >
        <defs>
          <linearGradient id={incomeGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-income)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--color-income)" stopOpacity="0.025" />
          </linearGradient>
          <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0.025" />
          </linearGradient>
        </defs>

        {[1, 2, 3].map((index) => {
          const y = PAD_Y + CHART_H * (index / 4);
          return (
            <line
              key={index}
              x1={PAD_X}
              y1={y}
              x2={PAD_X + CHART_W}
              y2={y}
              stroke="var(--color-outline)"
              strokeOpacity={0.22}
              strokeWidth={1}
            />
          );
        })}

        <CashFlowSeries points={incomePts} color="var(--color-income)" gradId={incomeGradId} bottomY={bottomY} />
        <CashFlowSeries points={expensePts} color="var(--color-expense)" gradId={expenseGradId} bottomY={bottomY} />
      </svg>
    </div>
  );
}

export function CashFlowLegend() {
  return (
    <div className="cashflow-legend" aria-hidden>
      <span className="cashflow-legend__dot cashflow-legend__dot--income" />
      <span className="cashflow-legend__dot cashflow-legend__dot--expense" />
    </div>
  );
}
