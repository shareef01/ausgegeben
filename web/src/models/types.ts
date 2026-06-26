export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Category {
  id?: number;
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: TransactionType;
  sortOrder: number;
}

export interface Expense {
  id?: number;
  amount: number;
  dateMillis: number;
  categoryId: number;
  note: string;
  receiptImagePath?: string | null;
  transactionType: TransactionType;
}

export type ThemeMode =
  | 'system'
  | 'light'
  | 'dark'
  | 'amoled'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lavender'
  | 'soft_light';

export type StorageMode = 'local' | 'cloud';

export type RecordListPeriod = 'this_month' | 'all_time';

export type TransactionTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export interface AppPreferences {
  currency: string;
  themeMode: ThemeMode;
  onboardingComplete: boolean;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  monthlyBudget: number | null;
  storageMode: StorageMode;
  authGatewayComplete: boolean;
  lastCloudSyncAt: number | null;
}

export interface AnalyticsPeriodOption {
  label: string;
  storageKey: string;
  rangeMillis: [number, number] | null;
}

export interface SpendingInsights {
  topCategoryName?: string;
  topCategoryAmount?: number;
  weekTotal?: number;
  monthDeltaPercent?: number;
}

export interface RecordUiState {
  expenses: Expense[];
  categories: Category[];
  searchQuery: string;
  typeFilter: TransactionTypeFilter;
  listPeriod: RecordListPeriod;
  insights: SpendingInsights;
  monthlyBudget: number | null;
  monthExpenses: Expense[];
  dayTotalsByLabel: Record<string, { income: number; expense: number }>;
  loading: boolean;
}

export interface DashboardUiState {
  periodKey: string;
  periodLabel: string;
  totalExpenses: number;
  totalIncome: number;
  totalTransfers: number;
  expensesByCategory: Map<number, number>;
  incomeByCategory: Map<number, number>;
  transfersByCategory: Map<number, number>;
  cashFlowTrend: CashFlowPoint[];
  loading: boolean;
}

export interface CashFlowPoint {
  label: string;
  bucketStartMillis: number;
  income: number;
  expense: number;
}

export interface ExpenseWithCategory extends Expense {
  category?: Category;
}
