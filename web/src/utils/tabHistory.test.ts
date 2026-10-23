import { describe, expect, it } from 'vitest';
import {
  APP_TABS,
  isAppTab,
  readTabFromSearch,
  shouldPushTab,
  tabUrlFor,
} from './tabHistory';

/**
 * UX-4: the URL is the source of truth for the active tab. These tests cover the merge rules;
 * `web/e2e/tabHistory.spec.ts` covers the real Back/Forward behaviour in a browser.
 */

describe('readTabFromSearch', () => {
  it('reads a valid tab', () => {
    expect(readTabFromSearch('?tab=insights')).toBe('insights');
    expect(readTabFromSearch('?tab=settings')).toBe('settings');
    expect(readTabFromSearch('?tab=record')).toBe('record');
  });

  it('falls back to record when the tab is missing, empty or unknown', () => {
    expect(readTabFromSearch('')).toBe('record');
    expect(readTabFromSearch('?')).toBe('record');
    expect(readTabFromSearch('?tab=')).toBe('record');
    expect(readTabFromSearch('?tab=nope')).toBe('record');
    expect(readTabFromSearch('?tab=INSIGHTS')).toBe('record');
  });

  it('ignores unrelated parameters around it', () => {
    expect(readTabFromSearch('?period=2026-05&tab=settings&q=coffee')).toBe('settings');
  });

  it('honours an explicit fallback', () => {
    expect(readTabFromSearch('', 'insights')).toBe('insights');
    expect(readTabFromSearch('?tab=nope', 'settings')).toBe('settings');
  });
});

describe('tabUrlFor', () => {
  it('writes the tab into an empty query', () => {
    expect(tabUrlFor('', '', 'insights')).toBe('?tab=insights');
  });

  it('replaces an existing tab instead of appending a second one', () => {
    const url = tabUrlFor('?tab=record', '', 'settings');
    expect(url).toBe('?tab=settings');
    expect(new URLSearchParams(url).getAll('tab')).toEqual(['settings']);
  });

  it('preserves unrelated parameters', () => {
    const url = tabUrlFor('?period=2026-05&tab=record&q=coffee', '', 'insights');
    const params = new URLSearchParams(url);
    expect(params.get('tab')).toBe('insights');
    expect(params.get('period')).toBe('2026-05');
    expect(params.get('q')).toBe('coffee');
  });

  it('preserves an in-page fragment so the skip link keeps working', () => {
    expect(tabUrlFor('', '#app-main', 'settings')).toBe('?tab=settings#app-main');
    expect(tabUrlFor('?tab=record', '#app-main', 'record')).toBe('?tab=record#app-main');
  });

  it('round-trips through the reader', () => {
    for (const tab of APP_TABS) {
      expect(readTabFromSearch(tabUrlFor('?keep=1', '', tab))).toBe(tab);
    }
  });
});

describe('shouldPushTab', () => {
  it('does not create a history entry for the tab that is already active', () => {
    expect(shouldPushTab('record', 'record')).toBe(false);
  });

  it('creates one for a different tab', () => {
    expect(shouldPushTab('insights', 'record')).toBe(true);
    expect(shouldPushTab('settings', 'insights')).toBe(true);
  });
});

describe('isAppTab', () => {
  it('accepts exactly the three tabs', () => {
    for (const tab of APP_TABS) expect(isAppTab(tab)).toBe(true);
    for (const value of ['', 'Record', 'home', null, undefined, 3]) expect(isAppTab(value)).toBe(false);
  });
});
