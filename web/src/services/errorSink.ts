/**
 * Ships buffered error reports to an endpoint you own.
 *
 * No third-party SDK and no vendor: the transport is a plain POST, so the receiver
 * can be a Cloud Function, a log collector, or anything else that accepts JSON.
 * Note that Cloud Functions require the Blaze plan — this project is otherwise
 * Spark-safe, so the endpoint stays opt-in via VITE_ERROR_REPORT_URL. With the
 * variable unset (the default, including every local build) nothing is sent and
 * errors remain console-only.
 *
 * If the endpoint lives on another origin, add it to `connect-src` in the
 * firebase.json CSP — the default policy allows same-origin only.
 */
import {
  reportError,
  setErrorBuffering,
  setErrorSink,
  type AppErrorReport,
} from '@/services/errorReporter';
import { readErrorReportingEnabled } from '@/services/errorReportPreference';

/**
 * A crash loop can fire the same error hundreds of times a second. Cap both total
 * sends and repeats of an identical error so a broken render cannot turn into a
 * self-inflicted flood against the endpoint.
 */
const MAX_SENDS_PER_SESSION = 10;

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: String(error) };
}

export interface ErrorSinkPayload {
  source: AppErrorReport['source'];
  at: number;
  error: SerializedError;
  context?: Record<string, unknown>;
  url: string;
  userAgent: string;
  release: string;
}

export function buildPayload(report: AppErrorReport): ErrorSinkPayload {
  return {
    source: report.source,
    at: report.at,
    error: serializeError(report.error),
    context: report.context,
    url: typeof location === 'undefined' ? '' : location.pathname,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    release: import.meta.env.MODE,
  };
}

/**
 * The body is JSON, but it is labelled text/plain on purpose.
 *
 * `application/json` is not a CORS-safelisted content type, so a cross-origin
 * post carrying it triggers a preflight OPTIONS first. That is a poor trade on
 * this path: the report is usually fired as the tab is closing, and requiring a
 * round-trip before the real request is exactly when delivery gets dropped.
 * text/plain is safelisted, so the report goes out in one hop. The receiver
 * parses it as JSON regardless (see tools/error-endpoint).
 */
const CONTENT_TYPE = 'text/plain;charset=UTF-8';

/**
 * `sendBeacon` first: a crash is often followed by the user closing the tab, and a
 * normal fetch is cancelled on unload while a beacon is handed to the browser to
 * deliver regardless. `keepalive` fetch is the fallback for browsers without it.
 */
function post(url: string, payload: ErrorSinkPayload): void {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: CONTENT_TYPE });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': CONTENT_TYPE },
    }).catch(() => {
      // Reporting the failure to report would recurse. Console only.
    });
  } catch {
    // Never let delivery problems surface as new errors.
  }
}

export function createEndpointSink(url: string): (report: AppErrorReport) => void {
  let sent = 0;
  const seen = new Set<string>();

  return (report) => {
    if (sent >= MAX_SENDS_PER_SESSION) return;
    const payload = buildPayload(report);
    const fingerprint = `${payload.source}:${payload.error.name}:${payload.error.message}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    sent += 1;
    post(url, payload);
  };
}

/**
 * Attaches the endpoint sink when one is configured. Returns whether it did, so
 * callers (and tests) can tell "no endpoint" from "endpoint attached".
 */
export function installConfiguredErrorSink(): boolean {
  const url = import.meta.env.VITE_ERROR_REPORT_URL?.trim();
  if (!url || !readErrorReportingEnabled()) return false;
  try {
    setErrorSink(createEndpointSink(url));
    return true;
  } catch (error) {
    reportError('manual', error, { during: 'installConfiguredErrorSink' });
    return false;
  }
}

/** Apply the local opt-out toggle and attach or detach the endpoint sink. */
export function applyErrorReportingPreference(enabled: boolean): void {
  // Order matters on disable: drop the sink first so nothing in flight can emit, then
  // clear the replay buffer. Leaving the buffer intact turned the opt-out into a delay —
  // every error captured while it was off shipped the moment it was switched back on.
  setErrorBuffering(enabled);
  if (!enabled) {
    setErrorSink(null);
    return;
  }
  installConfiguredErrorSink();
}
