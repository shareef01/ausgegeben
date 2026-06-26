import { Expense, Category } from '../../db/models';
import { AppIcon } from '../common/AppIcon';
import { MoneyText } from '../common/MoneyText';
import { formatTime } from '../../util/date';

interface TransactionItemProps {
  expense: Expense;
  category?: Category;
  onClick: () => void;
}

export const TransactionItem = ({ expense, category, onClick }: TransactionItemProps) => {
  const colorHex = category ? `#${(category.colorInt & 0xFFFFFF).toString(16).padStart(6, '0')}` : '#9e9e9e';

  return (
    <div
      onClick={onClick}
      className="flex items-center p-md active:bg-surface transition-colors cursor-pointer"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mr-md"
        style={{ backgroundColor: `${colorHex}24` }}
      >
        <AppIcon
          name={category?.iconName || 'help-circle'}
          size={18}
          style={{ color: colorHex }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="text-base font-medium text-on-background truncate">
          {category?.name || 'Unknown'}
        </h4>
        <p className="text-xs text-on-surface-variant truncate">
          {formatTime(expense.dateMillis)} {expense.note && `· ${expense.note}`}
        </p>
      </div>

      <div className="ml-md text-right">
        <MoneyText
          amount={expense.amount}
          color={expense.transactionType === 'income' ? 'income' : expense.transactionType === 'transfer' ? 'transfer' : 'default'}
          prefix={expense.transactionType === 'income' ? '+' : expense.transactionType === 'expense' ? '−' : ''}
          className="text-lg"
        />
      </div>
    </div>
  );
};
