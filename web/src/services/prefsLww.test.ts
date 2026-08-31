import { describe, expect, it } from 'vitest';
import { prefsLwwAction } from '@/services/prefsLww';

describe('prefsLwwAction', () => {
  it('newer remote replaces local', () => {
    expect(prefsLwwAction(20, 10)).toBe('apply_remote');
  });

  it('newer local pushes', () => {
    expect(prefsLwwAction(10, 20)).toBe('push_local');
  });

  it('equal clocks are stable', () => {
    expect(prefsLwwAction(10, 10)).toBe('hold');
  });
});
