import { describe, expect, it } from 'vitest';
import { nextRadioIndex, radioTabIndex } from './radioGroupKeys';

describe('nextRadioIndex (AUS-303)', () => {
  it('moves forward with ArrowDown and ArrowRight, wrapping at the end', () => {
    expect(nextRadioIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextRadioIndex('ArrowRight', 1, 3)).toBe(2);
    expect(nextRadioIndex('ArrowDown', 2, 3)).toBe(0);
  });

  it('moves back with ArrowUp and ArrowLeft, wrapping at the start', () => {
    expect(nextRadioIndex('ArrowUp', 2, 3)).toBe(1);
    expect(nextRadioIndex('ArrowLeft', 0, 3)).toBe(2);
  });

  it('jumps with Home and End', () => {
    expect(nextRadioIndex('Home', 2, 3)).toBe(0);
    expect(nextRadioIndex('End', 0, 3)).toBe(2);
  });

  it('enters the group from outside it', () => {
    expect(nextRadioIndex('ArrowDown', -1, 3)).toBe(0);
    expect(nextRadioIndex('ArrowUp', -1, 3)).toBe(2);
  });

  it('ignores other keys and empty groups', () => {
    expect(nextRadioIndex('Tab', 0, 3)).toBeNull();
    expect(nextRadioIndex(' ', 0, 3)).toBeNull();
    expect(nextRadioIndex('Enter', 0, 3)).toBeNull();
    expect(nextRadioIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('radioTabIndex', () => {
  it('gives the only tab stop to the checked option', () => {
    expect([0, 1, 2].map((i) => radioTabIndex(i === 1, i, true))).toEqual([-1, 0, -1]);
  });

  it('falls back to the first option when nothing is checked', () => {
    expect([0, 1, 2].map((i) => radioTabIndex(false, i, false))).toEqual([0, -1, -1]);
  });
});
