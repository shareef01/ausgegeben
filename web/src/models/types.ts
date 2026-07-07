import type { Locale } from '@/i18n';

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Category {
  id?: number;
  cloudId: string;
  name: string;
  iconName: string;
  colorInt: number;
  transactionType: TransactionType;
  sortOrder: number;
  updatedAt?: number;
  pendingSync?: boolean;
}

export interface Expense {
  id?: number;
  cloudId: string;
  amount: number;
  dateMillis: number;
  categoryId: number;
  note: string;
  receiptImagePath?: string | null;
  transactionType: TransactionType;
  updatedAt?: number;
  pendingSync?: boolean;
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
  locale: Locale;
  themeMode: ThemeMode;
  onboardingComplete: boolean;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  recordListPeriod: RecordListPeriod;
  monthlyBudget: number | null;
  storageMode: StorageMode;
  authGatewayComplete: boolean;
  lastCloudSyncAt: number | null;
  preferencesUpdatedAt: number;
  pendingExpenseDeleteCloudIds: string[];
  pendingCategoryDeleteCloudIds: string[];
  /** Last Firebase uid that owned local IndexedDB data (account-switch guard). */
  lastCloudUserId: string | null;
}

/** Preferences synced to Firestore (device-local flags excluded). */
export interface SyncedPreferences {
  currency: string;
  locale: Locale;
  themeMode: ThemeMode;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  recordListPeriod: RecordListPeriod;
  monthlyBudget: number | null;
  updatedAt: number;
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
  displayExpenses: Expense[];
  hasMore: boolean;
  listCount: number;
  summaryTotals: { totalExpenses: number; totalIncome: number };
  categories: Category[];
  searchQuery: string;
  typeFilter: TransactionTypeFilter;
  listPeriod: RecordListPeriod;
  insights: SpendingInsights;
  monthlyBudget: number | null;
  monthExpenses: Expense[];
  dayTotalsByLabel: Record<string, { income: number; expense: number }>;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
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
  loadError: string | null;
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
