/**
 * Preference-loading state machine.
 *
 * One boolean was not enough to describe this: "not ready" meant both "we are still
 * asking" and "the answer never arrived", so a slow network looked the same as a brand
 * new account and the app guessed. The gate now distinguishes five states and only
 * decides once an authoritative answer exists.
 *
 * - idle     no account / listener stopped
 * - loading  listener started, no authoritative answer yet (cached data may already be
 *            applied for theme/locale, but it is not proof about the document)
 * - loaded   a server snapshot was applied
 * - missing  the server confirmed there is no preferences document (created from local)
 * - error    the listener failed or timed out before any authoritative answer
 */
export type PreferencesStatus = 'idle' | 'loading' | 'loaded' | 'missing' | 'error';

export type PreferencesStatusEvent =
  | 'start'
  | 'loaded'
  | 'missing'
  | 'listener-error'
  | 'timeout'
  | 'stop';

/** Settled = an authoritative outcome exists; the app may render. */
export function isPreferencesSettled(status: PreferencesStatus): boolean {
  return status === 'loaded' || status === 'missing';
}

/**
 * A late error or timeout must not undo a status that already settled — Firestore can
 * report an error after a successful snapshot, and a retry that succeeded should not
 * fall back to the recovery screen.
 */
export function nextPreferencesStatus(
  current: PreferencesStatus,
  event: PreferencesStatusEvent,
): PreferencesStatus {
  switch (event) {
    case 'start':
      return 'loading';
    case 'loaded':
      return 'loaded';
    case 'missing':
      return 'missing';
    case 'listener-error':
    case 'timeout':
      return isPreferencesSettled(current) ? current : 'error';
    case 'stop':
      return 'idle';
  }
}

export type PreferencesScreen = 'loading' | 'recovery' | 'onboarding' | 'app';

/**
 * Which screen the app shell should render.
 *
 * `recovery` is an accessible retry/continue state rather than a silent guess: on a
 * slow or unavailable network the user chooses between retrying and continuing with
 * local preferences. Onboarding is only shown for a *known* incomplete account — an
 * unknown value renders the app, because re-onboarding a returning account is the
 * worse failure.
 */
export function preferencesScreenFor(input: {
  status: PreferencesStatus;
  onboardingKnown: boolean;
  onboardingComplete: boolean;
}): PreferencesScreen {
  if (input.status === 'error') return 'recovery';
  if (!isPreferencesSettled(input.status)) return 'loading';
  if (input.onboardingComplete || !input.onboardingKnown) return 'app';
  return 'onboarding';
}

/** Slack for the two auth timestamps, which are written separately at sign-up. */
const NEW_ACCOUNT_TOLERANCE_MS = 60_000;

/**
 * Whether Firebase reports an account that has not signed in again since it was
 * created (`creationTime` and `lastSignInTime` are the same moment). Such an account
 * cannot have finished onboarding on another device. Missing or unparsable timestamps
 * read as "not new", the direction that never re-onboards a returning account.
 */
export function isNewlyCreatedAccount(
  creationTime: string | undefined,
  lastSignInTime: string | undefined,
): boolean {
  if (!creationTime || !lastSignInTime) return false;
  const created = Date.parse(creationTime);
  const lastSignIn = Date.parse(lastSignInTime);
  if (Number.isNaN(created) || Number.isNaN(lastSignIn)) return false;
  return Math.abs(lastSignIn - created) <= NEW_ACCOUNT_TOLERANCE_MS;
}
