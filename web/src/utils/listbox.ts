/**
 * Keyboard navigation for the WAI-ARIA listbox pattern, kept as pure functions so the
 * arithmetic is testable without a DOM.
 *
 * This only decides *which* option becomes active. Focus movement, selection and the ARIA
 * state live in the component — pure-function tests prove the index maths, not the
 * accessibility behaviour, and the Playwright spec in `web/e2e/periodSelector.spec.ts` is what
 * actually verifies the keyboard interaction in a browser.
 */

export type ListboxNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

const NAVIGATION_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export function isListboxNavigationKey(key: string): key is ListboxNavigationKey {
  return NAVIGATION_KEYS.includes(key);
}

/**
 * Index the listbox should open on: the selected option when it is in range, otherwise the
 * first one. `null` when there is nothing to focus (an empty option list must not open a
 * listbox with no active descendant).
 */
export function initialListboxIndex(selectedIndex: number, count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= count) return 0;
  return selectedIndex;
}

/**
 * Index to move to for `key`, wrapping at both ends (a popup listbox should never trap focus
 * at an edge: ArrowDown on the last option goes back to the first, and vice versa).
 *
 * Returns null when the key is not a navigation key or there is nothing to move to, so the
 * caller can leave the event alone.
 */
export function nextListboxIndex(
  key: string,
  currentIndex: number,
  count: number,
): number | null {
  if (!isListboxNavigationKey(key) || !Number.isFinite(count) || count <= 0) return null;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < count
    ? currentIndex
    : -1;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    default:
      return null;
  }
}
