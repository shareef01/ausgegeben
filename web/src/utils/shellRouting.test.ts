import { describe, expect, it } from 'vitest';
import {
  buildShellPath,
  parseShellHash,
  parseShellPath,
  readShellRoute,
  shouldClearLocalDataBeforeSync,
  shouldHistoryBackOnOverlayClose,
} from '@/utils/shellRouting';

describe('parseShellPath', () => {
  it('defaults to record tab', () => {
    expect(parseShellPath('/')).toEqual({ tab: 'record', overlay: null });
    expect(parseShellPath('')).toEqual({ tab: 'record', overlay: null });
  });

  it('parses tabs', () => {
    expect(parseShellPath('/insights')).toEqual({ tab: 'insights', overlay: null });
    expect(parseShellPath('/settings')).toEqual({ tab: 'settings', overlay: null });
  });

  it('parses overlays with tab context', () => {
    expect(parseShellPath('/insights/add')).toEqual({ tab: 'insights', overlay: { type: 'add' } });
    expect(parseShellPath('/record/edit/42')).toEqual({
      tab: 'record',
      overlay: { type: 'edit', expenseId: 42 },
    });
    expect(parseShellPath('/settings/categories')).toEqual({
      tab: 'settings',
      overlay: { type: 'categories' },
    });
  });
});

describe('parseShellHash (legacy)', () => {
  it('still parses old hash bookmarks', () => {
    expect(parseShellHash('#/insights')).toEqual({ tab: 'insights', overlay: null });
  });
});

describe('buildShellPath', () => {
  it('round-trips tabs and overlays', () => {
    const cases = [
      { tab: 'record' as const, overlay: null },
      { tab: 'insights' as const, overlay: { type: 'add' as const } },
      { tab: 'record' as const, overlay: { type: 'edit' as const, expenseId: 9 } },
      { tab: 'settings' as const, overlay: { type: 'categories' as const } },
    ];
    for (const route of cases) {
      expect(parseShellPath(buildShellPath(route.tab, route.overlay))).toEqual(route);
    }
  });
});

describe('readShellRoute', () => {
  it('is exported for runtime navigation', () => {
    expect(typeof readShellRoute).toBe('function');
  });
});

describe('shouldHistoryBackOnOverlayClose', () => {
  it('backs only when overlay was pushed in session', () => {
    expect(shouldHistoryBackOnOverlayClose(true, true)).toBe(true);
    expect(shouldHistoryBackOnOverlayClose(false, true)).toBe(false);
    expect(shouldHistoryBackOnOverlayClose(true, false)).toBe(false);
  });
});

describe('shouldClearLocalDataBeforeSync', () => {
  it('clears only on account switch', () => {
    expect(shouldClearLocalDataBeforeSync(null, 'uid-a')).toBe(false);
    expect(shouldClearLocalDataBeforeSync('uid-a', 'uid-a')).toBe(false);
    expect(shouldClearLocalDataBeforeSync('uid-a', 'uid-b')).toBe(true);
  });
});
