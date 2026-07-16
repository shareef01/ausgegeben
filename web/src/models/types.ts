export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionTypeFilter = 'all' | 'expense' | 'income' | 'transfer';
export type RecordListPeriod = string;
export type ThemeMode = 'light' | 'dark' | 'system' | 'amoled' | 'midnight' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'soft_light';
export type StorageMode = 'local' | 'cloud';

export interface Category {
  id: string; // SECURE: String UUID
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: string;
  sortOrder: number;
  updatedAt?: number;
}

export interface Expense {
  id: string; // SECURE: String UUID
  amount: number;
  dateMillis: number;
  categoryId: string;
  note: string;
  receiptImagePath: string | null;
  transactionType: TransactionType;
  updatedAt?: number;
  idempotencyKey?: string;
}

export interface AnalyticsPeriodOption {
  label: string;
  storageKey: string;
  rangeMillis: [number, number] | null;
}

export interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
}

export interface RecordUiState {
  expenses: Expense[];
  categories: Category[];
  searchQuery: string;
  typeFilter: TransactionTypeFilter;
  listPeriod: RecordListPeriod;
  insights: Record<string, never>;
  monthlyBudget: number | null;
  monthExpenses: Expense[];
  dayTotalsByLabel: Record<string, [number, number]>;
  loading: boolean;
  loadError?: boolean;
}

export interface DashboardUiState {
  periodKey: string;
  periodLabel: string;
  totalExpenses: number;
  totalIncome: number;
  totalTransfers: number;
  expensesByCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
  transfersByCategory: Map<string, number>;
  cashFlowTrend: CashFlowPoint[];
  loading: boolean;
  loadError?: boolean;
}

export interface AppPreferences {
  currency: string;
  locale: 'en' | 'de';
  themeMode: ThemeMode;
  onboardingComplete: boolean;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  monthlyBudget: number | null;
  storageMode: StorageMode;
  lastCloudSyncAt: number | null;
  preferencesUpdatedAt: number;
}

export interface SyncedPreferences {
  currency: string;
  locale: 'en' | 'de';
  themeMode: ThemeMode;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  monthlyBudget: number | null;
  updatedAt: number;
}
