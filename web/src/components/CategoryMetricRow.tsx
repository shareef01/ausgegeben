import { formatAmount } from '@/utils/currency';

interface CategoryMetricRowProps {
  name: string;
  amount: number;
  total: number;
  color: string;
  currency: string;
}

export function CategoryMetricRow({ name, amount, total, color, currency }: CategoryMetricRowProps) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;

  return (
    <div className="category-metric-row">
      <span className="category-metric-row__swatch" aria-hidden>
        <span className="category-metric-row__dot" style={{ background: color }} />
      </span>
      <div className="category-metric-row__text">
        <span className="category-metric-row__name">{name}</span>
        <span className="category-metric-row__pct">{pct}%</span>
      </div>
      <span className="category-metric-row__amount tabular-nums">{formatAmount(amount, currency)}</span>
    </div>
  );
}
