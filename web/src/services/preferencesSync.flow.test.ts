import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncedPreferences } from '@/models/types';

/**
 * End-to-end behaviour of the preferences listener against a fake Firestore: what the
 * store shows and what gets written when the first server answer arrives late.
 */
const fake = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  includeMetadataChanges: false,
  remoteDoc: null as Record<string, unknown> | null,
  writes: [] as Record<string, unknown>[],
  currentUser: {
    emailVerified: true,
    metadata: { creationTime: undefined as string | undefined, lastSignInTime: undefined as string | undefined },
  },
}));

vi.mock('@/services/firebase', () => ({
  getFirebaseFirestore: () => ({}),
  getFirebaseAuth: () => ({ currentUser: fake.currentUser }),
}));

vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  doc: () => ({}),
  onSnapshot: (_ref: unknown, options: { includeMetadataChanges?: boolean }, next: (snap: unknown) => void) => {
    fake.includeMetadataChanges = options.includeMetadataChanges === true;
    fake.next = next;
    return () => { fake.next = null; };
  },
  runTransaction: async (_fs: unknown, update: (tx: unknown) => Promise<unknown>) =>
    update({
      get: async () => snapshot(fake.remoteDoc),
      set: (_ref: unknown, payload: Record<string, unknown>) => {
        fake.writes.push(payload);
        fake.remoteDoc = payload;
      },
    }),
}));

import { preferencesSync } from '@/services/preferencesSync';
import { usePreferencesStore } from '@/services/preferencesStore';
import { preferencesScreenFor } from '@/services/prefsLoadState';

function snapshot(data: Record<string, unknown> | null, fromCache = false) {
  return {
    exists: () => data !== null,
    data: () => data,
    metadata: { fromCache },
  };
}

function serverSends(data: Record<string, unknown> | null): void {
  fake.remoteDoc = data;
  fake.next!(snapshot(data));
}

function cacheSends(data: Record<string, unknown> | null): void {
  fake.next!(snapshot(data, true));
}

function screen() {
  const s = usePreferencesStore.getState();
  return preferencesScreenFor({
    status: s.preferencesStatus,
    onboardingKnown: s.onboardingKnown,
    onboardingComplete: s.onboardingComplete,
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const cloud: SyncedPreferences = {
  currency: 'CHF',
  locale: 'de',
  themeMode: 'light',
  onboardingComplete: true,
  dailyReminder: false,
  reminderHour: 7,
  reminderMinute: 30,
  analyticsPeriod: 'all_time',
  monthlyBudget: 500,
  updatedAt: 1_000,
};

beforeEach(() => {
  const storage: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
  fake.writes = [];
  fake.remoteDoc = null;
  fake.currentUser.metadata = { creationTime: undefined, lastSignInTime: undefined };
  usePreferencesStore.getState().resetPreferences();
});

afterEach(() => {
  preferencesSync.stop();
  usePreferencesStore.getState().resetPreferences();
});

describe('settings changed before the first server read', () => {
  it('keeps the cloud preferences and only the field the user changed', async () => {
    preferencesSync.start('u1');
    preferencesSync.continueWithLocal();
    usePreferencesStore.getState().setThemeMode('dark');
    expect(fake.writes).toHaveLength(0);

    serverSends({ ...cloud });
    await flush();

    const s = usePreferencesStore.getState();
    expect(s.currency).toBe('CHF');
    expect(s.locale).toBe('de');
    expect(s.monthlyBudget).toBe(500);
    expect(s.reminderHour).toBe(7);
    expect(s.themeMode).toBe('dark');

    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({
      currency: 'CHF',
      locale: 'de',
      monthlyBudget: 500,
      dailyReminder: false,
      themeMode: 'dark',
    });
    expect(fake.writes[0].updatedAt as number).toBeGreaterThan(cloud.updatedAt);
  });

  it('keeps unread edits across a retry', async () => {
    preferencesSync.start('u1');
    usePreferencesStore.getState().setCurrency('USD');
    preferencesSync.retry();

    serverSends({ ...cloud });
    await flush();

    expect(usePreferencesStore.getState().currency).toBe('USD');
    expect(usePreferencesStore.getState().locale).toBe('de');
    expect(fake.writes[0]).toMatchObject({ currency: 'USD', locale: 'de', monthlyBudget: 500 });
  });

  it('still adopts the cloud document unchanged when nothing was edited', async () => {
    preferencesSync.start('u1');
    serverSends({ ...cloud });
    await flush();

    expect(usePreferencesStore.getState().currency).toBe('CHF');
    expect(fake.writes).toHaveLength(0);
  });
});

describe('onboarding answer when local wins the comparison', () => {
  it('records an incomplete account as known on push_local', async () => {
    usePreferencesStore.setState({ preferencesUpdatedAt: 5_000 });
    preferencesSync.start('u1');
    serverSends({ ...cloud, onboardingComplete: false });
    await flush();

    expect(usePreferencesStore.getState().onboardingKnown).toBe(true);
    expect(screen()).toBe('onboarding');
  });

  it('records an incomplete account as known on equal timestamps (hold)', async () => {
    usePreferencesStore.setState({ preferencesUpdatedAt: cloud.updatedAt });
    preferencesSync.start('u1');
    serverSends({ ...cloud, onboardingComplete: false });
    await flush();

    expect(screen()).toBe('onboarding');
    expect(fake.writes).toHaveLength(0);
  });

  it('never un-completes onboarding finished on this device', async () => {
    usePreferencesStore.setState({ preferencesUpdatedAt: 5_000, onboardingComplete: true });
    preferencesSync.start('u1');
    serverSends({ ...cloud, onboardingComplete: false });
    await flush();

    expect(screen()).toBe('app');
  });
});

describe('cached snapshots', () => {
  it('listens for metadata changes so a server copy equal to the cache still arrives', () => {
    preferencesSync.start('u1');
    expect(fake.includeMetadataChanges).toBe(true);
  });

  it('previews a cached document without settling the gate or writing', async () => {
    usePreferencesStore.setState({ preferencesUpdatedAt: 5_000 });
    preferencesSync.start('u1');
    cacheSends({ ...cloud, onboardingComplete: false, updatedAt: 1_000 });
    await flush();

    // Stale cache, newer local: last-write-wins would have pushed here.
    expect(fake.writes).toHaveLength(0);
    expect(screen()).toBe('loading');

    cacheSends({ ...cloud, updatedAt: 9_000 });
    await flush();
    expect(usePreferencesStore.getState().currency).toBe('CHF');
    expect(screen()).toBe('loading');
    expect(fake.writes).toHaveLength(0);
  });

  it('settles from the server copy that follows the cache', async () => {
    preferencesSync.start('u1');
    cacheSends({ ...cloud, onboardingComplete: false });
    serverSends({ ...cloud, onboardingComplete: true, updatedAt: 2_000 });
    await flush();

    expect(screen()).toBe('app');
  });

  it('merges edits made after a cached preview onto the server copy', async () => {
    preferencesSync.start('u1');
    cacheSends({ ...cloud });
    usePreferencesStore.getState().setThemeMode('dark');
    serverSends({ ...cloud, monthlyBudget: 900, updatedAt: 2_000 });
    await flush();

    const s = usePreferencesStore.getState();
    expect(s.themeMode).toBe('dark');
    expect(s.monthlyBudget).toBe(900);
    expect(fake.writes[0]).toMatchObject({ themeMode: 'dark', monthlyBudget: 900 });
  });
});

describe('continue with this device', () => {
  it('sends a brand-new account to onboarding', () => {
    const now = new Date().toUTCString();
    fake.currentUser.metadata = { creationTime: now, lastSignInTime: now };
    preferencesSync.start('u1');
    preferencesSync.continueWithLocal();

    expect(screen()).toBe('onboarding');
  });

  it('does not re-onboard a returning account whose answer is unknown', () => {
    fake.currentUser.metadata = {
      creationTime: 'Mon, 01 Jun 2026 10:00:00 GMT',
      lastSignInTime: 'Sun, 25 Oct 2026 10:00:00 GMT',
    };
    preferencesSync.start('u1');
    preferencesSync.continueWithLocal();

    expect(screen()).toBe('app');
  });
});
