import { useLiveQuery } from 'dexie-react-hook';
import { db } from '../db/db';
import { RecordHeader } from '../components/record/RecordHeader';
import { TransactionItem } from '../components/record/TransactionItem';
import { formatDate, localDayStartMillis } from '../util/date';
import { AppIcon } from '../components/common/AppIcon';
import { MoneyText } from '../components/common/MoneyText';

export const RecordScreen = ({ onAddClick }: { onAddClick: () => void }) => {
  const expenses = useLiveQuery(() => db.expenses.orderBy('dateMillis').reverse().toArray());
  const categories = useLiveQuery(() => db.categories.toArray());

  const categoryMap = new Map(categories?.map(c => [c.id, c]));

  const groupedExpenses = expenses?.reduce((groups, expense) => {
    const day = localDayStartMillis(expense.dateMillis);
    if (!groups[day]) groups[day] = [];
    groups[day].push(expense);
    return groups;
  }, {} as Record<number, typeof expenses>);

  const totalIncome = expenses?.filter(e => e.transactionType === 'income').reduce((sum, e) => sum + e.amount, 0) || 0;
  const totalExpense = expenses?.filter(e => e.transactionType === 'expense').reduce((sum, e) => sum + e.amount, 0) || 0;

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <header className="px-md pt-lg pb-md">
        <h1 className="text-3xl font-bold">Records</h1>
      </header>

      <RecordHeader
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        periodLabel="This Month"
      />

      <div className="flex-1">
        {groupedExpenses && Object.entries(groupedExpenses).sort((a, b) => Number(b[0]) - Number(a[0])).map(([day, dayExpenses]) => {
          const dayMillis = Number(day);
          const dayIncome = dayExpenses.filter(e => e.transactionType === 'income').reduce((sum, e) => sum + e.amount, 0);
          const dayExpense = dayExpenses.filter(e => e.transactionType === 'expense').reduce((sum, e) => sum + e.amount, 0);

          return (
            <div key={day} className="mb-xs">
              <div className="flex justify-between items-center px-md py-2 bg-surface/50">
                <span className="text-sm font-medium text-on-surface-variant">
                  {formatDate(dayMillis)}
                </span>
                <div className="space-x-3">
                  {dayIncome > 0 && (
                    <MoneyText amount={dayIncome} color="income" className="text-xs" prefix="+" />
                  )}
                  {dayExpense > 0 && (
                    <MoneyText amount={dayExpense} color="expense" className="text-xs" prefix="−" />
                  )}
                </div>
              </div>

              <div className="divide-y divide-divider/50">
                {dayExpenses.map(expense => (
                  <TransactionItem
                    key={expense.id}
                    expense={expense}
                    category={categoryMap.get(expense.categoryId)}
                    onClick={() => {}}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onAddClick}
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-background rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <AppIcon name="plus" size={24} />
      </button>
    </div>
  );
};
