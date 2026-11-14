import type { KeyboardEvent } from 'react';

/**
 * Keyboard support for the Settings pickers (AUS-303). Each option is a button with
 * role="radio", and ARIA roles add no keyboard behavior, so every option was its own
 * Tab stop and the arrow keys did nothing.
 *
 * Now the group has one Tab stop, the checked option ([radioTabIndex]), and the arrow
 * keys move focus through the options, wrapping at either end, with Home and End for the
 * first and last. Space or Enter picks the focused option, as before.
 *
 * Unlike the plain W3C radio pattern, arrows move focus without selecting. Picking
 * applies at once and closes the picker (changing the language re-renders the whole
 * app), so selecting on every arrow press would apply each option in turn and close the
 * picker after the first one.
 */

const NEXT = new Set(['ArrowDown', 'ArrowRight']);
const PREVIOUS = new Set(['ArrowUp', 'ArrowLeft']);

/** The option index a key moves focus to, or null when the key is not a group key. */
export function nextRadioIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (NEXT.has(key)) return current < 0 ? 0 : (current + 1) % count;
  if (PREVIOUS.has(key)) return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Roving tab stop: the checked option, or the first one when none is checked. */
export function radioTabIndex(selected: boolean, index: number, anySelected: boolean): 0 | -1 {
  if (selected) return 0;
  return !anySelected && index === 0 ? 0 : -1;
}

/** onKeyDown for an element with role="radiogroup". */
export function handleRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const current = radios.indexOf(document.activeElement as HTMLElement);
  const next = nextRadioIndex(e.key, current, radios.length);
  if (next == null) return;
  e.preventDefault();
  radios[next].focus();
}
