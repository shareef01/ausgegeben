import { computeTotals } from '@/utils/analytics';
import type { Expense } from '@/models/types';
import { MoneyText } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { IconArrowUp, IconArrowDown } from '@/components/Icons';

interface FinanceSummaryCardProps {
  expenses: Expense[];
  currency: string;
  periodLabel: string;
}

export function FinanceSummaryCard({ expenses, currency, periodLabel }: FinanceSummaryCardProps) {
  const { t } = useTranslation();
  const { totalExpenses, totalIncome, net } = computeTotals(expenses);
  const netPositive = net >= 0;
  const balanceClass = netPositive ? 'text-emerald-400' : net < 0 ? 'text-rose-500' : 'text-zinc-100';

  return (
    <div className="card--pro p-6">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{t('summaryBalance')} · {periodLabel}</div>
      <div className="mb-8">
        <MoneyText
          amount={net}
          currency={currency}
          className={`text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums mt-2 selection:bg-rose-500/20 ${balanceClass}`}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 mt-7">
          <StatChip variant="income" label={t('summaryEarned')} value={totalIncome} currency={currency} />
          <StatChip variant="expense" label={t('summarySpent')} value={totalExpenses} currency={currency} />
        </div>
    </div>
  );
}

function StatChip({ variant, label, value, currency }: { variant: 'income' | 'expense'; label: string; value: number; currency: string; muted?: boolean }) {
  const isIncome = variant === 'income';
  const accentColor = isIncome ? 'text-emerald-400' : 'text-rose-500';
  const bgColor = isIncome ? 'bg-emerald-500/10' : 'bg-rose-500/10';

  return (
    <div className="bg-surface border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all hover:bg-[#18181B] group active:scale-[0.98]">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${bgColor} ${accentColor} transition-transform group-hover:scale-110`}>
        {isIncome ? <IconArrowUp width={16} height={16} strokeWidth={2.5} /> : <IconArrowDown width={16} height={16} strokeWidth={2.5} />}
      </div>
      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1.5 opacity-80">
        {label}
      </div>
      <MoneyText amount={value} currency={currency} className="tabular-nums text-base font-black text-zinc-100" />
    </div>
  );
}
