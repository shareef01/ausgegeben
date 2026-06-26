export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Category {
  id?: number;
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: TransactionType;
  order: number;
}

export interface Expense {
  id?: number;
  amount: number;
  dateMillis: number;
  categoryId: number;
  note: string;
  receiptImagePath?: string;
  transactionType: TransactionType;
}
