import { describe, expect, it } from 'vitest';
import { totalsDisclosure } from '@/utils/insightsTotals';

/**
 * The Insights totals dock labels its expense total "anticipated" only when a future-dated
 * expense is counted, but its net becomes "anticipated net cash flow" when *either* side has a
 * future-dated row. Future-dated income used to be ignored, so a month whose net was already
 * inflated by unearned income still read as a plain "net cash flow".
 *
 * Mirrored case for case in Android `InsightsTotalsDisclosureTest`.
 */
describe('insights totals disclosure', () => {
  it('neither side has a future-dated row: both labels stay actual', () => {
    expect(totalsDisclosure(0, 0)).toEqual({ expenseIsAnticipated: false, netIsAnticipated: false });
  });

  it('future-dated expense only: expense and net are both anticipated', () => {
    expect(totalsDisclosure(25, 0)).toEqual({ expenseIsAnticipated: true, netIsAnticipated: true });
  });

  it('future-dated income only: net is anticipated while the expense total stays actual', () => {
    expect(totalsDisclosure(0, 40)).toEqual({ expenseIsAnticipated: false, netIsAnticipated: true });
  });

  it('both sides future-dated: expense and net are both anticipated', () => {
    expect(totalsDisclosure(25, 40)).toEqual({ expenseIsAnticipated: true, netIsAnticipated: true });
  });

  it('a sub-cent amount is not a contributing row', () => {
    expect(totalsDisclosure(0.004, 0)).toEqual({ expenseIsAnticipated: false, netIsAnticipated: false });
    expect(totalsDisclosure(0, 0.004)).toEqual({ expenseIsAnticipated: false, netIsAnticipated: false });
  });

  it('one cent is a contributing row', () => {
    expect(totalsDisclosure(0.01, 0)).toEqual({ expenseIsAnticipated: true, netIsAnticipated: true });
  });
});
