import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '@/services/firebase';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import type { AppPreferences, SyncedPreferences, ThemeMode } from '@/models/types';
import { normalizeAnalyticsPeriodKey } from '@/utils/periodUtils';

export const PREFS_SYNC_ERROR_PERMISSION = 'permission';
export const PREFS_SYNC_ERROR_NETWORK = 'network';
export const PREFS_SYNC_ERROR_GENERIC = 'generic';

const PREFS_COLLECTION = 'settings';
const PREFS_DOC = 'preferences';
const PREFS_READY_TIMEOUT_MS = 8_000;

const VALID_LOCALES = new Set(['en', 'de']);
const VALID_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF']);
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

const ANALYTICS_PERIOD_RE = /^(all_time|this_month|last_month|month:\d{4}-(0[1-9]|1[0-2]))$/;

let snapUnsub: Unsubscribe | null = null;
let storeUnsub: (() => void) | null = null;
let readyTimeout: ReturnType<typeof setTimeout> | null = null;
let activeUid: string | null = null;
let suppressPush = false;
let lastWrittenAt = 0;
let pushInFlight: Promise<void> | null = null;

function prefsRef(uid: string) {
  return doc(getFirebaseFirestore()!, 'users', uid, PREFS_COLLECTION, PREFS_DOC);
}

function canWritePreferences(): boolean {
  return getFirebaseAuth()?.currentUser?.emailVerified === true;
}

function validAnalyticsPeriod(value: string): boolean {
  return ANALYTICS_PERIOD_RE.test(value);
}

/**
 * Ensure payload matches firestore.rules validPreferences (post-audit allowlists).
 *
 * themeMode and locale are clamped here as well as in parseRemote. They used to be
 * validated inbound only, so a bad local value could not be corrected on its way
 * out — the write just failed validation and surfaced as a permission-denied sync
 * error, with no indication of which field was at fault. Both directions now agree.
 */
export function sanitizeSyncedPreferences(prefs: SyncedPreferences): SyncedPreferences {
  const currency = VALID_CURRENCIES.has(prefs.currency) ? prefs.currency : 'EUR';
  const locale = VALID_LOCALES.has(prefs.locale) ? prefs.locale : 'en';
  const themeMode = VALID_THEMES.has(prefs.themeMode) ? prefs.themeMode : 'system';
  const normalizedPeriod = normalizeAnalyticsPeriodKey(prefs.analyticsPeriod);
  const analyticsPeriod = validAnalyticsPeriod(normalizedPeriod)
    ? normalizedPeriod
    : validAnalyticsPeriod(prefs.analyticsPeriod)
      ? prefs.analyticsPeriod
      : 'this_month';
  const updatedAt = prefs.updatedAt > 0 ? prefs.updatedAt : Date.now();
  return {
    ...prefs,
    currency,
    locale,
    themeMode,
    analyticsPeriod,
    updatedAt,
    reminderHour: Math.min(23, Math.max(0, prefs.reminderHour)),
    reminderMinute: Math.min(59, Math.max(0, prefs.reminderMinute)),
    monthlyBudget:
      prefs.monthlyBudget != null && prefs.monthlyBudget > 0 ? prefs.monthlyBudget : null,
  };
}

export function toSyncedPreferences(state: AppPreferences): SyncedPreferences {
  return sanitizeSyncedPreferences({
    currency: state.currency,
    locale: state.locale,
    themeMode: state.themeMode,
    onboardingComplete: state.onboardingComplete,
    dailyReminder: state.dailyReminder,
    reminderHour: state.reminderHour,
    reminderMinute: state.reminderMinute,
    analyticsPeriod: state.analyticsPeriod,
    monthlyBudget: state.monthlyBudget,
    updatedAt: state.preferencesUpdatedAt,
  });
}

function parseRemote(raw: Record<string, unknown>): SyncedPreferences | null {
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
  const locale = raw.locale;
  const themeMode = raw.themeMode;
  if (typeof locale !== 'string' || !VALID_LOCALES.has(locale)) return null;
  if (typeof themeMode !== 'string' || !VALID_THEMES.has(themeMode as ThemeMode)) return null;

  // Match Android: a non-positive budget means "no budget set"
  const monthlyBudget =
    typeof raw.monthlyBudget === 'number' && raw.monthlyBudget > 0 ? raw.monthlyBudget : null;
  // Existing cloud prefs docs predate this field — treat missing as already onboarded.
  const onboardingComplete =
    typeof raw.onboardingComplete === 'boolean' ? raw.onboardingComplete : true;

  return sanitizeSyncedPreferences({
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : 'EUR',
    locale: locale as 'en' | 'de',
    themeMode: themeMode as ThemeMode,
    onboardingComplete,
    dailyReminder: typeof raw.dailyReminder === 'boolean' ? raw.dailyReminder : true,
    reminderHour: typeof raw.reminderHour === 'number' ? Math.min(23, Math.max(0, raw.reminderHour)) : 19,
    reminderMinute: typeof raw.reminderMinute === 'number' ? Math.min(59, Math.max(0, raw.reminderMinute)) : 0,
    analyticsPeriod: typeof raw.analyticsPeriod === 'string' ? raw.analyticsPeriod : 'this_month',
    monthlyBudget,
    updatedAt,
  });
}

function markReady(): void {
  if (readyTimeout) {
    clearTimeout(readyTimeout);
    readyTimeout = null;
  }
  usePreferencesStore.getState().markPreferencesReady();
}

async function writeRemote(uid: string, prefs: SyncedPreferences): Promise<void> {
  const fs = getFirebaseFirestore();
  if (!fs) return;
  // Rules require email_verified — keep local-only until the user confirms.
  if (!canWritePreferences()) return;

  let payload = sanitizeSyncedPreferences(prefs);
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
      useAuthStore.getState().setSyncError(null);
    })
    .catch((err: unknown) => {
      console.warn('[prefs] failed to write preferences', err);
      useAuthStore.getState().setSyncError(classifyPrefsError(err));
    })
    .finally(() => {
      pushInFlight = null;
    });
  await pushInFlight;
}

function applyRemote(remote: SyncedPreferences): void {
  suppressPush = true;
  usePreferencesStore.getState().applySyncedPreferences(remote);
  lastWrittenAt = remote.updatedAt;
  suppressPush = false;
}

function classifyPrefsError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return PREFS_SYNC_ERROR_PERMISSION;
  if (code === 'unavailable' || code === 'deadline-exceeded') return PREFS_SYNC_ERROR_NETWORK;
  return PREFS_SYNC_ERROR_GENERIC;
}

export const preferencesSync = {
  start(uid: string): void {
    if (activeUid === uid && snapUnsub) return;
    this.stop();
    activeUid = uid;
    useAuthStore.getState().setSyncError(null);
    usePreferencesStore.setState({ preferencesReady: false });
    readyTimeout = setTimeout(() => {
      if (!usePreferencesStore.getState().preferencesReady) {
        console.warn('[prefs] snapshot timed out; continuing with local preferences');
        markReady();
      }
    }, PREFS_READY_TIMEOUT_MS);
    if (!getFirebaseFirestore()) {
      markReady();
      return;
    }

    snapUnsub = onSnapshot(
      prefsRef(uid),
      (snap) => {
        useAuthStore.getState().setSyncError(null);
        const local = usePreferencesStore.getState();
        const localAt = local.preferencesUpdatedAt;

        if (!snap.exists()) {
          void writeRemote(uid, toSyncedPreferences(local)).finally(() => {
            markReady();
          });
          return;
        }

        const remote = parseRemote(snap.data() as Record<string, unknown>);
        if (!remote) {
          markReady();
          return;
        }

        if (remote.updatedAt > localAt) {
          applyRemote(remote);
        } else if (localAt > remote.updatedAt) {
          void writeRemote(uid, toSyncedPreferences(local));
        } else if (typeof (snap.data() as Record<string, unknown>).onboardingComplete !== 'boolean') {
          // Backfill onboardingComplete onto legacy docs without bumping LWW.
          void writeRemote(uid, { ...remote, onboardingComplete: remote.onboardingComplete });
        }

        markReady();
      },
      (err) => {
        console.warn('[prefs] sync listener error', err);
        useAuthStore.getState().setSyncError(classifyPrefsError(err));
        markReady();
      },
    );

    storeUnsub = usePreferencesStore.subscribe((state, prev) => {
      if (suppressPush || !activeUid) return;
      if (state.preferencesUpdatedAt === prev.preferencesUpdatedAt) return;
      if (state.preferencesUpdatedAt <= lastWrittenAt) return;
      void writeRemote(activeUid, toSyncedPreferences(state));
    });
  },

  retry(): void {
    const uid = activeUid ?? useAuthStore.getState().user?.uid;
    if (!uid) return;
    useAuthStore.getState().setSyncError(null);
    this.stop();
    this.start(uid);
  },

  stop(): void {
    snapUnsub?.();
    snapUnsub = null;
    storeUnsub?.();
    storeUnsub = null;
    if (readyTimeout) {
      clearTimeout(readyTimeout);
      readyTimeout = null;
    }
    activeUid = null;
    suppressPush = false;
    lastWrittenAt = 0;
    pushInFlight = null;
  },
};
