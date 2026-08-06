export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionTypeFilter = 'all' | 'expense' | 'income' | 'transfer';
export type RecordListPeriod = string;
export type ThemeMode = 'light' | 'dark' | 'system' | 'amoled' | 'midnight' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'soft_light';

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
  transactionType: TransactionType;
  updatedAt?: number;
  idempotencyKey?: string;
  deleted?: boolean;
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
  /** Search/type-filtered rows for the transaction list. */
  expenses: Expense[];
  /** Period-scoped expenses (soft-deletes excluded) for balance / period summary. */
  summaryExpenses: Expense[];
  categories: Category[];
  searchQuery: string;
  typeFilter: TransactionTypeFilter;
  listPeriod: RecordListPeriod;
  /** Calendar-month top expense category name (Android Record chip parity). */
  topExpenseCategoryName: string | null;
  monthlyBudget: number | null;
  monthExpenses: Expense[];
  /** Day-key → [income, expense] from the full period (not search/type-filtered). */
  dayTotalsByLabel: Record<string, [number, number]>;
  loading: boolean;
  loadError?: boolean;
  /** True when all-time list is capped at the latest 5,000 rows. */
  dataTruncated?: boolean;
}

export interface InsightsUiState {
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
  /** True when all-time analytics used a capped expense fetch. */
  dataTruncated?: boolean;
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
  preferencesUpdatedAt: number;
}

export interface SyncedPreferences {
  currency: string;
  locale: 'en' | 'de';
  themeMode: ThemeMode;
  onboardingComplete: boolean;
  dailyReminder: boolean;
  reminderHour: number;
  reminderMinute: number;
  analyticsPeriod: string;
  monthlyBudget: number | null;
  updatedAt: number;
}
