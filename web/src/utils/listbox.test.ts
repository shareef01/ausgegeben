import { describe, expect, it } from 'vitest';
import {
  initialListboxIndex,
  isListboxNavigationKey,
  nextListboxIndex,
} from './listbox';

describe('initialListboxIndex', () => {
  it('opens on the selected option', () => {
    expect(initialListboxIndex(3, 14)).toBe(3);
  });

  it('falls back to the first option when the selection is out of range', () => {
    expect(initialListboxIndex(-1, 5)).toBe(0);
    expect(initialListboxIndex(9, 5)).toBe(0);
    expect(initialListboxIndex(1.5, 5)).toBe(0);
  });

  it('returns null for an empty list so no listbox opens with no active option', () => {
    expect(initialListboxIndex(0, 0)).toBeNull();
    expect(initialListboxIndex(0, -1)).toBeNull();
  });

  it('handles a single-option list', () => {
    expect(initialListboxIndex(0, 1)).toBe(0);
    expect(initialListboxIndex(7, 1)).toBe(0);
  });
});

describe('nextListboxIndex', () => {
  it('moves down and up one option', () => {
    expect(nextListboxIndex('ArrowDown', 2, 5)).toBe(3);
    expect(nextListboxIndex('ArrowUp', 2, 5)).toBe(1);
  });

  it('wraps at both ends', () => {
    expect(nextListboxIndex('ArrowDown', 4, 5)).toBe(0);
    expect(nextListboxIndex('ArrowUp', 0, 5)).toBe(4);
  });

  it('jumps to the first and last option', () => {
    expect(nextListboxIndex('Home', 3, 14)).toBe(0);
    expect(nextListboxIndex('End', 3, 14)).toBe(13);
  });

  it('starts at the top or bottom when nothing is active yet', () => {
    expect(nextListboxIndex('ArrowDown', -1, 4)).toBe(0);
    expect(nextListboxIndex('ArrowUp', -1, 4)).toBe(3);
  });

  it('stays put on a single-option list', () => {
    expect(nextListboxIndex('ArrowDown', 0, 1)).toBe(0);
    expect(nextListboxIndex('ArrowUp', 0, 1)).toBe(0);
    expect(nextListboxIndex('Home', 0, 1)).toBe(0);
    expect(nextListboxIndex('End', 0, 1)).toBe(0);
  });

  it('returns null for keys it does not own, or an empty list', () => {
    expect(nextListboxIndex('Enter', 1, 5)).toBeNull();
    expect(nextListboxIndex(' ', 1, 5)).toBeNull();
    expect(nextListboxIndex('Escape', 1, 5)).toBeNull();
    expect(nextListboxIndex('ArrowDown', 0, 0)).toBeNull();
  });

  it('treats an out-of-range current index as "nothing active"', () => {
    expect(nextListboxIndex('ArrowDown', 99, 5)).toBe(0);
    expect(nextListboxIndex('ArrowUp', 99, 5)).toBe(4);
  });
});

describe('isListboxNavigationKey', () => {
  it('accepts exactly the four navigation keys', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(isListboxNavigationKey(key)).toBe(true);
    }
    for (const key of ['Enter', ' ', 'Escape', 'Tab', 'a', 'PageDown']) {
      expect(isListboxNavigationKey(key)).toBe(false);
    }
  });
});
