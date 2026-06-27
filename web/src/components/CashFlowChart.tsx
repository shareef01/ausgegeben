import { useId, useMemo } from 'react';

interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

interface CashFlowChartProps {
  trend: CashFlowPoint[];
}

const CHART_HEIGHT = 120;
const BASELINE = 100;
const PLOT_HEIGHT = 80;

function chartPoints(trend: CashFlowPoint[], max: number, valueKey: 'income' | 'expense') {
  const width = Math.max(trend.length * 40, 80);
  return trend.map((p, i) => {
    const x = trend.length <= 1 ? width / 2 : i * (width / (trend.length - 1));
    const value = p[valueKey];
    const y = BASELINE - (value / max) * PLOT_HEIGHT;
    return { x, y, value };
  });
}

/** Smooth cubic Bezier through chart points (FinTech-style curve). */
function bezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPath(points: { x: number; y: number }[], baseline: number): string {
  if (points.length === 0) return '';
  const line = bezierPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function CashFlowChart({ trend }: CashFlowChartProps) {
  const uid = useId().replace(/:/g, '');
  const incomeGradId = `cf-income-${uid}`;
  const expenseGradId = `cf-expense-${uid}`;

  const max = useMemo(
    () => Math.max(...trend.flatMap((p) => [p.income, p.expense]), 1),
    [trend],
  );

  const width = Math.max(trend.length * 40, 80);
  const incomePts = useMemo(() => chartPoints(trend, max, 'income'), [trend, max]);
  const expensePts = useMemo(() => chartPoints(trend, max, 'expense'), [trend, max]);

  if (trend.length === 0) return null;

  return (
    <div className="cashflow-chart">
      <svg
        className="cashflow-chart__svg"
        width="100%"
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id={incomeGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-income)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-income)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-expense)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-expense)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath(incomePts, BASELINE)} fill={`url(#${incomeGradId})`} />
        <path d={areaPath(expensePts, BASELINE)} fill={`url(#${expenseGradId})`} />

        <path
          d={bezierPath(incomePts)}
          fill="none"
          stroke="var(--color-income)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={bezierPath(expensePts)}
          fill="none"
          stroke="var(--color-expense)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {incomePts.map((pt, i) => (
          <circle key={`i-${i}`} cx={pt.x} cy={pt.y} r="3.5" fill="var(--color-income)" stroke="var(--color-surface)" strokeWidth="1.5" />
        ))}
        {expensePts.map((pt, i) => (
          <circle key={`e-${i}`} cx={pt.x} cy={pt.y} r="3.5" fill="var(--color-expense)" stroke="var(--color-surface)" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}
