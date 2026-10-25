import { doc, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '@/services/firebase';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import type { AppPreferences, SyncedPreferences, ThemeMode } from '@/models/types';
import { normalizeAnalyticsPeriodKey } from '@/utils/periodUtils';
import { fromMinorUnits, toMinorUnits } from '@/utils/money';
import {
  changedPreferenceFields,
  mergeUnreadEdits,
  prefsSnapshotAction,
  type SyncedPreferenceField,
} from '@/services/prefsSnapshotPolicy';
import {
  isNewlyCreatedAccount,
  isPreferencesSettled,
  nextPreferencesStatus,
  type PreferencesStatusEvent,
} from '@/services/prefsLoadState';
import { PREFERENCES_DOC, SETTINGS_COLLECTION } from '@/repositories/firestorePaths';

export const PREFS_SYNC_ERROR_PERMISSION = 'permission';
export const PREFS_SYNC_ERROR_NETWORK = 'network';
export const PREFS_SYNC_ERROR_GENERIC = 'generic';

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
/**
 * Whether the cloud document has been read for this session. Until then, local values
 * must never be pushed (they may just be defaults): see writeRemote.
 */
let authoritativeRead = false;
/** Settings the user changed before `authoritativeRead`; merged on the first read. */
let unreadEdits = new Set<SyncedPreferenceField>();

function prefsRef(uid: string) {
  return doc(getFirebaseFirestore()!, 'users', uid, SETTINGS_COLLECTION, PREFERENCES_DOC);
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
    // Rules reject a changed sub-cent budget; rounding also normalizes a legacy value.
    monthlyBudget:
      prefs.monthlyBudget != null && prefs.monthlyBudget > 0
        ? fromMinorUnits(toMinorUnits(prefs.monthlyBudget))
        : null,
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

function settlePreferences(event: PreferencesStatusEvent): void {
  if (readyTimeout) {
    clearTimeout(readyTimeout);
    readyTimeout = null;
  }
  const store = usePreferencesStore.getState();
  store.setPreferencesStatus(nextPreferencesStatus(store.preferencesStatus, event));
}

async function writeRemote(uid: string, prefs: SyncedPreferences): Promise<void> {
  const fs = getFirebaseFirestore();
  if (!fs) return;
  // Rules require email_verified — keep local-only until the user confirms.
  if (!canWritePreferences()) return;
  // Never write before the cloud document has actually been read. Without this, a user
  // who chose "continue with this device" (or whose first snapshot timed out) would push
  // local defaults over real preferences on their next settings change, because their
  // fresh timestamp wins the last-write-wins comparison.
  if (!authoritativeRead) return;

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

  pushInFlight = runTransaction(fs, async (transaction) => {
    const ref = prefsRef(uid);
    const snapshot = await transaction.get(ref);
    const remote = snapshot.exists()
      ? parseRemote(snapshot.data() as Record<string, unknown>)
      : null;
    // Strict first-writer-wins for equal clocks. Firestore retries this callback if
    // another device commits between the read and write, so stale payloads cannot win.
    if (remote && remote.updatedAt >= payload.updatedAt) {
      return remote;
    }
    transaction.set(ref, payload, { merge: true });
    return null;
  })
    .then((remoteWinner) => {
      if (remoteWinner &&
          remoteWinner.updatedAt >= usePreferencesStore.getState().preferencesUpdatedAt) {
        applyRemote(remoteWinner);
      } else if (!remoteWinner) {
        lastWrittenAt = payload.updatedAt;
      }
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
    authoritativeRead = false;
    useAuthStore.getState().setSyncError(null);
    // Also detects an account switch that never emitted a signed-out state.
    usePreferencesStore.getState().beginPreferencesForUser(uid);
    readyTimeout = setTimeout(() => {
      // No authoritative answer in time: surface a recovery state (retry / continue
      // offline) instead of silently deciding with local defaults. A brand-new account
      // must not skip onboarding just because the network was slow.
      if (!isPreferencesSettled(usePreferencesStore.getState().preferencesStatus)) {
        console.warn('[prefs] snapshot timed out; offering recovery');
      }
      settlePreferences('timeout');
    }, PREFS_READY_TIMEOUT_MS);
    if (!getFirebaseFirestore()) {
      // No Firestore configured at all: there is nothing to load from, so the local
      // preferences are the only source of truth for this build.
      usePreferencesStore.setState({ onboardingKnown: true });
      settlePreferences('missing');
      return;
    }

    snapUnsub = onSnapshot(
      prefsRef(uid),
      // Without this, a server copy identical to the cache is a metadata-only change
      // that is never delivered, and the gate waits on `fromCache: false` until timeout.
      { includeMetadataChanges: true },
      (snap) => {
        useAuthStore.getState().setSyncError(null);
        const local = usePreferencesStore.getState();
        const localAt = local.preferencesUpdatedAt;

        const remote = snap.exists()
          ? parseRemote(snap.data() as Record<string, unknown>)
          : null;
        const action = prefsSnapshotAction({
          exists: snap.exists(),
          fromCache: snap.metadata.fromCache,
          remote,
          localUpdatedAt: localAt,
        });

        if (action === 'await_server') {
          // Cache-only "not found" is not the server's answer. Writing defaults here
          // used to overwrite real preferences and re-show onboarding on reload.
          return;
        }
        if (action === 'preview_cached' && remote) {
          // Show cached preferences (theme, locale) right away, but keep waiting: the
          // gate, unread-edit merge and any push all wait for the server copy. Its
          // onboarding answer still counts as known, which is better than nothing if
          // the user later continues offline.
          applyRemote(remote);
          return;
        }
        if (action === 'create_remote') {
          authoritativeRead = true;
          // The local values, edits included, become the document.
          unreadEdits = new Set();
          void writeRemote(uid, toSyncedPreferences(local)).finally(() => {
            // The server answered "no document". This account's local value is now the
            // authoritative one — including the "onboarding not completed" default a
            // brand-new account should see. Marking it known keeps the gate's rule
            // (unknown must never show onboarding) intact.
            usePreferencesStore.setState({ onboardingKnown: true });
            settlePreferences('missing');
          });
          return;
        }
        if (action === 'unusable') {
          // The document exists but cannot be understood. Treat existing preferences as
          // authority: mark completion as well as "known", so a legacy account is
          // neither re-onboarded nor stuck in recovery. setState (not an action) leaves
          // the timestamp untouched, so nothing is written over that document.
          usePreferencesStore.setState({ onboardingKnown: true, onboardingComplete: true });
          authoritativeRead = true;
          unreadEdits = new Set();
          settlePreferences('loaded');
          return;
        }
        const firstRead = !authoritativeRead;
        authoritativeRead = true;
        if (firstRead && remote && unreadEdits.size > 0) {
          // Settings were changed before the cloud document was read (recovery
          // "continue with this device", or a change during a slow first load). Plain
          // last-write-wins would push this device's defaults over everything else;
          // keep the remote document and lay only the edited fields over it.
          const merged = mergeUnreadEdits({
            remote,
            local: toSyncedPreferences(local),
            edited: unreadEdits,
            now: Date.now(),
          });
          unreadEdits = new Set();
          applyRemote(merged);
          void writeRemote(uid, merged);
        } else if (action === 'apply_remote' && remote) {
          applyRemote(remote);
        } else if (action === 'push_local') {
          void writeRemote(uid, toSyncedPreferences(local));
        }
        unreadEdits = new Set();
        if (remote && action !== 'apply_remote') {
          // The document was read even when local won the comparison, so its onboarding
          // answer is known. Without this, push_local/hold left the gate on "unknown",
          // which renders the app and skipped onboarding for an incomplete account.
          usePreferencesStore.setState((state) => ({
            onboardingKnown: true,
            onboardingComplete: state.onboardingComplete || remote.onboardingComplete,
          }));
        }

        settlePreferences('loaded');
      },
      (err) => {
        console.warn('[prefs] sync listener error', err);
        useAuthStore.getState().setSyncError(classifyPrefsError(err));
        settlePreferences('listener-error');
      },
    );

    storeUnsub = usePreferencesStore.subscribe((state, prev) => {
      if (suppressPush || !activeUid) return;
      if (state.preferencesUpdatedAt === prev.preferencesUpdatedAt) return;
      if (!authoritativeRead) {
        // writeRemote would drop this; remember which settings the user touched so the
        // first server read can keep them without adopting this device's defaults.
        for (const field of changedPreferenceFields(state, prev)) unreadEdits.add(field);
        return;
      }
      if (state.preferencesUpdatedAt <= lastWrittenAt) return;
      void writeRemote(activeUid, toSyncedPreferences(state));
    });
  },

  retry(): void {
    const uid = activeUid ?? useAuthStore.getState().user?.uid;
    if (!uid) return;
    useAuthStore.getState().setSyncError(null);
    // Same account, same unread edits: a retry must not forget what the user changed.
    const pendingEdits = unreadEdits;
    this.stop();
    this.start(uid);
    unreadEdits = pendingEdits;
  },

  /**
   * The recovery screen's "continue with this device": render with local preferences
   * while the listener keeps waiting for the server.
   *
   * Onboarding stays gated on a known answer, so a returning account is never
   * re-onboarded. The exception is an account that has never signed in again since it
   * was created: it cannot have finished onboarding anywhere else, and without this it
   * would skip onboarding entirely on a slow first connection.
   */
  continueWithLocal(): void {
    const store = usePreferencesStore.getState();
    if (!store.onboardingKnown) {
      const metadata = getFirebaseAuth()?.currentUser?.metadata;
      if (isNewlyCreatedAccount(metadata?.creationTime, metadata?.lastSignInTime)) {
        usePreferencesStore.setState({ onboardingKnown: true });
      }
    }
    usePreferencesStore.getState().setPreferencesStatus('loaded');
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
    authoritativeRead = false;
    unreadEdits = new Set();
    usePreferencesStore.getState().endPreferences();
  },
};
