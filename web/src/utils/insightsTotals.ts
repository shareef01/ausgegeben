import { toMinorUnits } from '@/utils/money';

/**
 * Which labels the Insights totals dock uses once future-dated rows are part of the value.
 *
 * The dock's totals cover every row in the selected period, so a future-dated row makes the
 * figure larger than money already moved. The expense total is only "anticipated" when a
 * future-dated expense is counted, but **net cash flow** is anticipated whenever either side
 * contributes one — future-dated income inflates it just as future-dated expense deflates it.
 * A future-income-only month therefore keeps a plain "spent" total and an anticipated net.
 *
 * Mirrored in Android `util/InsightsAnalytics.kt` (`totalsDisclosure`); both clients must
 * answer identically.
 */
export interface TotalsDisclosure {
  expenseIsAnticipated: boolean;
  netIsAnticipated: boolean;
}

export function totalsDisclosure(upcomingExpense: number, upcomingIncome: number): TotalsDisclosure {
  const futureExpense = toMinorUnits(upcomingExpense) > 0;
  const futureIncome = toMinorUnits(upcomingIncome) > 0;
  return { expenseIsAnticipated: futureExpense, netIsAnticipated: futureExpense || futureIncome };
}
