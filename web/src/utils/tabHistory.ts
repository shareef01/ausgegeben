/**
 * Tab ↔ URL synchronisation for the app shell (UX-4).
 *
 * The shell used to keep the active tab in `useState` only, so the browser Back button left the
 * app (an installed PWA closed) instead of returning to the previous tab, and no tab was
 * linkable.
 *
 * The tab lives in `?tab=` rather than in the fragment on purpose: `#app-main` is the
 * skip-to-content target and fragment navigation has to keep working. Everything here is a pure
 * string function, so the ordering/merge rules are unit-tested in `tabHistory.test.ts`; the real
 * Back/Forward behaviour is covered by `web/e2e/tabHistory.spec.ts`.
 */

export const APP_TABS = ['record', 'insights', 'settings'] as const;
export type AppTab = (typeof APP_TABS)[number];

export const TAB_PARAM = 'tab';

/** The tab named by `search`, or `fallback` when absent or not a known tab. */
export function readTabFromSearch(search: string, fallback: AppTab = 'record'): AppTab {
  const params = new URLSearchParams(search);
  const value = params.get(TAB_PARAM);
  return isAppTab(value) ? value : fallback;
}

export function isAppTab(value: unknown): value is AppTab {
  return typeof value === 'string' && (APP_TABS as readonly string[]).includes(value);
}

/**
 * The URL to push for `tab`: every unrelated query parameter and any in-page fragment is kept,
 * so a future deep link (`?tab=insights&period=2026-05#chart`) is not destroyed by switching
 * tabs, and the skip link's hash still resolves.
 */
export function tabUrlFor(search: string, hash: string, tab: AppTab): string {
  const params = new URLSearchParams(search);
  params.set(TAB_PARAM, tab);
  const query = params.toString();
  return `${query ? `?${query}` : ''}${hash || ''}`;
}

/**
 * Whether activating `next` should create a history entry. Re-clicking the active tab must not
 * push a duplicate, or Back would appear to do nothing.
 */
export function shouldPushTab(next: AppTab, current: AppTab): boolean {
  return next !== current;
}
