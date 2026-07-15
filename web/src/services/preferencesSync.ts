import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/services/firebase';
import { usePreferencesStore } from '@/services/preferencesStore';
import type { AppPreferences, SyncedPreferences, ThemeMode } from '@/models/types';

const PREFS_COLLECTION = 'settings';
const PREFS_DOC = 'preferences';

const VALID_LOCALES = new Set(['en', 'de']);
const VALID_THEMES = new Set<ThemeMode>([
  'light',
  'dark',
  'system',
  'amoled',
  'midnight',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'soft_light',
]);

let snapUnsub: Unsubscribe | null = null;
let storeUnsub: (() => void) | null = null;
let activeUid: string | null = null;
let suppressPush = false;
let lastWrittenAt = 0;
let pushInFlight: Promise<void> | null = null;

function prefsRef(uid: string) {
  return doc(getFirebaseFirestore()!, 'users', uid, PREFS_COLLECTION, PREFS_DOC);
}

export function toSyncedPreferences(state: AppPreferences): SyncedPreferences {
  return {
    currency: state.currency,
    locale: state.locale,
    themeMode: state.themeMode,
    dailyReminder: state.dailyReminder,
    reminderHour: state.reminderHour,
    reminderMinute: state.reminderMinute,
    analyticsPeriod: state.analyticsPeriod,
    monthlyBudget: state.monthlyBudget,
    updatedAt: state.preferencesUpdatedAt,
  };
}

function parseRemote(raw: Record<string, unknown>): SyncedPreferences | null {
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
  const locale = raw.locale;
  const themeMode = raw.themeMode;
  if (typeof locale !== 'string' || !VALID_LOCALES.has(locale)) return null;
  if (typeof themeMode !== 'string' || !VALID_THEMES.has(themeMode as ThemeMode)) return null;

  const monthlyBudget = typeof raw.monthlyBudget === 'number' ? raw.monthlyBudget : null;

  return {
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'EUR',
    locale: locale as 'en' | 'de',
    themeMode: themeMode as ThemeMode,
    dailyReminder: typeof raw.dailyReminder === 'boolean' ? raw.dailyReminder : true,
    reminderHour: typeof raw.reminderHour === 'number' ? Math.min(23, Math.max(0, raw.reminderHour)) : 19,
    reminderMinute: typeof raw.reminderMinute === 'number' ? Math.min(59, Math.max(0, raw.reminderMinute)) : 0,
    analyticsPeriod: typeof raw.analyticsPeriod === 'string' ? raw.analyticsPeriod : 'this_month',
    monthlyBudget,
    updatedAt,
  };
}

async function writeRemote(uid: string, prefs: SyncedPreferences): Promise<void> {
  const fs = getFirebaseFirestore();
  if (!fs) return;

  let payload = prefs;
  if (!payload.updatedAt) {
    const updatedAt = Date.now();
    payload = { ...payload, updatedAt };
    suppressPush = true;
    usePreferencesStore.setState({ preferencesUpdatedAt: updatedAt });
    suppressPush = false;
  }

  if (payload.updatedAt === lastWrittenAt && pushInFlight) {
    await pushInFlight;
    return;
  }

  lastWrittenAt = payload.updatedAt;
  pushInFlight = setDoc(prefsRef(uid), payload, { merge: true })
    .then(() => {
      usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
    })
    .catch((err: unknown) => {
      console.warn('[prefs] failed to write preferences', err);
    })
    .finally(() => {
      pushInFlight = null;
    });
  await pushInFlight;
}

function applyRemote(remote: SyncedPreferences): void {
  suppressPush = true;
  usePreferencesStore.getState().applySyncedPreferences(remote);
  usePreferencesStore.getState().setLastCloudSyncAt(Date.now());
  lastWrittenAt = remote.updatedAt;
  suppressPush = false;
}

export const preferencesSync = {
  start(uid: string): void {
    if (activeUid === uid && snapUnsub) return;
    this.stop();
    activeUid = uid;
    if (!getFirebaseFirestore()) return;

    snapUnsub = onSnapshot(
      prefsRef(uid),
      (snap) => {
        const local = usePreferencesStore.getState();
        const localAt = local.preferencesUpdatedAt;

        if (!snap.exists()) {
          void writeRemote(uid, toSyncedPreferences(local));
          return;
        }

        const remote = parseRemote(snap.data() as Record<string, unknown>);
        if (!remote) return;

        if (remote.updatedAt > localAt) {
          applyRemote(remote);
        } else if (localAt > remote.updatedAt) {
          void writeRemote(uid, toSyncedPreferences(local));
        }
      },
      (err) => {
        console.warn('[prefs] sync listener error', err);
      },
    );

    storeUnsub = usePreferencesStore.subscribe((state, prev) => {
      if (suppressPush || !activeUid) return;
      if (state.preferencesUpdatedAt === prev.preferencesUpdatedAt) return;
      if (state.preferencesUpdatedAt <= lastWrittenAt) return;
      void writeRemote(activeUid, toSyncedPreferences(state));
    });
  },

  stop(): void {
    snapUnsub?.();
    snapUnsub = null;
    storeUnsub?.();
    storeUnsub = null;
    activeUid = null;
    suppressPush = false;
    lastWrittenAt = 0;
    pushInFlight = null;
  },
};
