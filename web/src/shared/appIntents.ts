/** Posted from the service worker when a reminder notification is tapped. */
export const APP_INTENT_OPEN_ADD = 'OPEN_ADD_TRANSACTION';

/** Window event when the running SPA should open the add-transaction sheet. */
export const OPEN_ADD_INTENT_EVENT = 'ausgegeben:open-add';

export const OPEN_ADD_QUERY_PARAM = 'openAdd';

/** True when the booted shell is mounted (vs auth/onboarding-only routes). */
export function isMainShellActive(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.getElementById('main-content'));
}

/** Strips ?openAdd=1 from the URL after a cold-start deep link. */
export function consumeOpenAddQueryParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(OPEN_ADD_QUERY_PARAM) !== '1') return false;
  params.delete(OPEN_ADD_QUERY_PARAM);
  const path = window.location.pathname || '/record';
  const query = params.toString();
  window.history.replaceState(null, '', query ? `${path}?${query}` : path);
  return true;
}

/** Ask the running shell to open the add sheet (reminder tap while app is open). */
export function dispatchOpenAddIntent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_ADD_INTENT_EVENT));
}

/** Navigate or signal the shell to open add — used by page-level notification fallback. */
export function navigateToOpenAdd(): void {
  if (typeof window === 'undefined') return;
  window.focus();
  if (isMainShellActive()) {
    dispatchOpenAddIntent();
    return;
  }
  window.location.assign(`/record?${OPEN_ADD_QUERY_PARAM}=1`);
}
