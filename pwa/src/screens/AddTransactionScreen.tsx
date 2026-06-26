import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hook';
import { db } from '../db/db';
import { TransactionType, Category } from '../db/models';
import { AppIcon } from '../components/common/AppIcon';
import { IosSegmentedControl } from '../components/common/IosSegmentedControl';
import { NumericKeypad } from '../components/add/NumericKeypad';
import { CategoryGrid } from '../components/add/CategoryGrid';
import { MoneyText } from '../components/common/MoneyText';

export const AddTransactionScreen = ({ onBack }: { onBack: () => void }) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const categories = useLiveQuery(() =>
    db.categories.where('transactionType').equals(type).toArray()
  , [type]);

  const accentColor = useMemo(() => {
    if (type === 'income') return '#4caf50';
    if (type === 'transfer') return '#9e9e9e';
    return '#f44336';
  }, [type]);

  const handleKeyPress = (key: string) => {
    setAmount(prev => {
      if (prev === '0' && key !== ',') return key;
      if (key === ',' && prev.includes(',')) return prev;
      return prev + key;
    });
  };

  const handleBackspace = () => {
    setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  const handleSave = async () => {
    if (!selectedCategory) return;
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    await db.expenses.add({
      amount: parsedAmount,
      dateMillis: new Date(date).getTime(),
      categoryId: selectedCategory.id!,
      note: note,
      transactionType: type
    });

    onBack();
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center px-md py-4">
        <button onClick={onBack} className="p-2 -ml-2">
          <AppIcon name="arrow-left" size={24} />
        </button>
        <h1 className="text-xl font-semibold ml-2">New Transaction</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="px-md py-4">
          <IosSegmentedControl
            options={['Expense', 'Income', 'Transfer']}
            selectedIndex={type === 'expense' ? 0 : type === 'income' ? 1 : 2}
            onSelected={(i) => {
              const newType = i === 0 ? 'expense' : i === 1 ? 'income' : 'transfer';
              setType(newType);
              setSelectedCategory(null);
            }}
          />
        </div>

        <div className="text-center py-8">
          <p className="text-sm font-medium text-on-surface-variant mb-2">
            Amount ({type})
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-semibold text-on-surface-variant">€</span>
            <span
              className="text-5xl font-bold transition-colors"
              style={{ color: accentColor }}
            >
              {amount}
            </span>
          </div>
        </div>

        <div className="px-md mb-6">
          <div className="bg-surface rounded-2xl p-md">
            <input
              type="text"
              placeholder="Add a note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-center text-lg"
            />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-on-surface-variant">
            <AppIcon name="calendar" size={16} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm font-medium"
            />
          </div>
        </div>

        <CategoryGrid
          categories={categories || []}
          selectedId={selectedCategory?.id}
          onSelect={setSelectedCategory}
          accentColor={accentColor}
        />
      </div>

      <div className="bg-background">
        <div className="px-md py-4">
          <button
            onClick={handleSave}
            disabled={!selectedCategory || amount === '0'}
            className="w-full h-14 rounded-full font-bold text-lg shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
            style={{ backgroundColor: accentColor, color: '#ffffff' }}
          >
            Save Transaction
          </button>
        </div>
        <NumericKeypad onPress={handleKeyPress} onBackspace={handleBackspace} />
      </div>
    </div>
  );
};
