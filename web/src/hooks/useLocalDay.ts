import { useEffect, useState } from 'react';
import { startOfTomorrowMillis } from '@/utils/analytics';

/** Local midnight at the start of the day containing [nowMillis]. */
export function startOfLocalDay(nowMillis = Date.now()): number {
  const d = new Date(nowMillis);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/** Minimal event source, so the watcher can run against `document`/`window` or a test target. */
interface EventSource {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Calls [onDayChange] with the new start-of-day whenever the local date changes, and
 * returns a stop function.
 *
 * A timer fires just after the next local midnight, but timers in a hidden tab are
 * throttled and do not run while the machine sleeps, so the day is also re-checked
 * whenever the page becomes visible or regains focus. Nothing is reported unless the
 * date actually changed.
 */
export function watchLocalDay(
  onDayChange: (startOfDay: number) => void,
  targets: { visibility: EventSource; focus: EventSource },
  isVisible: () => boolean = () => true,
  now: () => number = Date.now,
): () => void {
  let current = startOfLocalDay(now());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const day = startOfLocalDay(now());
    if (day !== current) {
      current = day;
      onDayChange(day);
    }
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    // One second past midnight, so a timer that fires a hair early still lands on the new day.
    timer = setTimeout(() => {
      check();
      schedule();
    }, startOfTomorrowMillis(now()) - now() + 1000);
  };
  const onVisibleAgain = () => {
    if (!isVisible()) return;
    check();
    schedule();
  };

  schedule();
  targets.visibility.addEventListener('visibilitychange', onVisibleAgain);
  targets.focus.addEventListener('focus', onVisibleAgain);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    targets.visibility.removeEventListener('visibilitychange', onVisibleAgain);
    targets.focus.removeEventListener('focus', onVisibleAgain);
  };
}

/**
 * Start of the current local day, updated when the date changes while the app is open.
 *
 * Use it as a dependency of anything derived from "today": a period range, the
 * "same days last month" cut-off, the list of month options. Memoising those on the
 * selected period alone froze them at mount, so a tab left open past midnight kept the
 * old day, and past a month boundary "this month" kept showing the previous month.
 */
export function useLocalDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay());
  useEffect(
    () =>
      watchLocalDay(setDay, { visibility: document, focus: window }, () => document.visibilityState === 'visible'),
    [],
  );
  return day;
}
