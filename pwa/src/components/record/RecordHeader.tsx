import { MoneyText } from '../common/MoneyText';

interface RecordHeaderProps {
  totalIncome: number;
  totalExpense: number;
  periodLabel: string;
}

export const RecordHeader = ({ totalIncome, totalExpense, periodLabel }: RecordHeaderProps) => {
  const net = totalIncome - totalExpense;

  return (
    <div className="bg-surface-variant/30 p-6 rounded-2xl mx-md mb-md">
      <div className="flex justify-between items-end mb-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-on-surface-variant font-medium mb-1">
            {periodLabel}
          </p>
          <h2 className="text-3xl font-semibold">
            <MoneyText amount={net} color={net >= 0 ? 'income' : 'expense'} />
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-divider">
        <div>
          <p className="text-xs text-on-surface-variant mb-1">Income</p>
          <MoneyText amount={totalIncome} color="income" className="text-lg" prefix="+" />
        </div>
        <div className="text-right">
          <p className="text-xs text-on-surface-variant mb-1">Expenses</p>
          <MoneyText amount={totalExpense} color="expense" className="text-lg" prefix="−" />
        </div>
      </div>
    </div>
  );
};
