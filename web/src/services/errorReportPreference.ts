const STORAGE_KEY = 'ausgegeben-report-errors';

/** Default on — matches the pre-opt-out behaviour when an endpoint is configured. */
export function readErrorReportingEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

export function writeErrorReportingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // private mode / storage disabled — memory-only is acceptable here
  }
}
