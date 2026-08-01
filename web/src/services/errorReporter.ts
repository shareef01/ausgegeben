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
  if (recent.length >= RECENT_LIMIT) recent.shift();
  recent.push(report);
  console.error(`[${source}]`, error, context ?? '');
  emit(report);
}

export function getRecentErrors(): readonly AppErrorReport[] {
  return recent;
}

/** Test-only: drop buffered reports so cases cannot leak into one another. */
export function resetErrorReporter(): void {
  recent.length = 0;
  sink = null;
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
