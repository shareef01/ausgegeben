const STORAGE_KEY = 'ausgegeben-report-errors';

/**
 * Default off: crash reports leave the device only after the user turns them on in
 * Settings. Error messages and stacks are kept free of entered values by construction
 * (see errorSink.ts), but that is a promise about our code, not a filter, so sending
 * them is the user's choice rather than the default — in line with the memory-only
 * cache and session-only sign-in this app starts with.
 */
export function readErrorReportingEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeErrorReportingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // private mode / storage disabled — memory-only is acceptable here
  }
}
