/**
 * Central sink for errors that would otherwise vanish.
 *
 * The app had no error boundary and no global handlers, so a render-time throw
 * produced a blank page that the service worker then served from cache — nothing
 * logged it and nobody could reload out of it. This module is the one place every
 * such failure passes through.
 *
 * Deliberately dependency-free: it must keep working when the thing that broke is
 * Firebase init, the preferences store, or the bundle itself. Attaching a real
 * reporter (Crashlytics, Sentry, a logging endpoint) is a matter of calling
 * [setErrorSink] once at startup — no call site changes.
 */

export type AppErrorSource = 'render' | 'window' | 'promise' | 'manual';

export interface AppErrorReport {
  source: AppErrorSource;
  error: unknown;
  context?: Record<string, unknown>;
  at: number;
}

type ErrorSink = (report: AppErrorReport) => void;

/**
 * Errors that arrive before a sink is attached are replayed to it on attach.
 * Startup crashes are the ones most worth reporting and the ones most likely to
 * happen before any reporter has loaded, so dropping them would defeat the point.
 */
const RECENT_LIMIT = 20;
const recent: AppErrorReport[] = [];
let sink: ErrorSink | null = null;

/**
 * When false, errors are still logged to the console but never buffered for replay.
 *
 * The replay buffer and the user's opt-out used to be independent: opting out cleared the
 * sink, but reportError kept filling `recent`, so re-enabling replayed everything captured
 * while reporting was switched off. An opt-out that defers transmission rather than
 * suppressing it is not an opt-out.
 */
let bufferingEnabled = true;

function emit(report: AppErrorReport): void {
  if (!sink) return;
  try {
    sink(report);
  } catch (sinkError) {
    // A throwing sink must never escalate the error it was handed.
    console.warn('[errorReporter] sink threw', sinkError);
  }
}

export function setErrorSink(next: ErrorSink | null): void {
  sink = next;
  if (!next) return;
  for (const report of recent) emit(report);
}

export function reportError(
  source: AppErrorSource,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const report: AppErrorReport = { source, error, context, at: Date.now() };
  // Console logging is local and always on; only the replay buffer is gated, so an
  // opted-out session cannot accumulate reports that a later opt-in would ship.
  if (bufferingEnabled) {
    if (recent.length >= RECENT_LIMIT) recent.shift();
    recent.push(report);
  }
  console.error(`[${source}]`, error, context ?? '');
  emit(report);
}

/**
 * Turn buffering on or off, dropping anything already held when turning it off.
 *
 * Called by the Settings opt-out. Clearing on disable is the load-bearing half: without
 * it, errors captured before the user opted out would still be replayed the moment they
 * opted back in.
 */
export function setErrorBuffering(enabled: boolean): void {
  bufferingEnabled = enabled;
  if (!enabled) recent.length = 0;
}

export function getRecentErrors(): readonly AppErrorReport[] {
  return recent;
}

/** Test-only: drop buffered reports so cases cannot leak into one another. */
export function resetErrorReporter(): void {
  recent.length = 0;
  sink = null;
  bufferingEnabled = true;
}

/**
 * Catches what an error boundary structurally cannot: throws from event handlers,
 * async callbacks, and rejected promises with no catch. Returns a cleanup function.
 */
export function installGlobalErrorHandlers(target: EventTarget = window): () => void {
  const onError = (event: Event) => {
    const { error, message, filename, lineno, colno } = event as ErrorEvent;
    reportError('window', error ?? message, { filename, line: lineno, column: colno });
  };
  const onRejection = (event: Event) => {
    reportError('promise', (event as PromiseRejectionEvent).reason);
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
