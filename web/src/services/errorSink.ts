/**
 * Ships buffered error reports to an endpoint you own.
 *
 * No third-party SDK and no vendor: the transport is a plain POST, so the receiver
 * can be a Cloud Function, a log collector, or anything else that accepts JSON.
 * The endpoint stays opt-in via VITE_ERROR_REPORT_URL and outside Firebase's
 * billing/storage failure domain. With the
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
  type DiagnosticContext,
} from '@/services/errorReporter';
import { readErrorReportingEnabled } from '@/services/errorReportPreference';
import { getBackendAppCheckToken } from '@/services/firebase';

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

const TEXT_LIMIT = 500;
const STACK_LIMIT = 4_000;

/**
 * Credential-shaped redaction — this is NOT a PII or financial-data filter. It only
 * recognizes tokens/secrets/emails by their own shape; ordinary free text (a merchant
 * name, a note, an amount) has no such shape and passes through untouched. That gap is
 * closed structurally instead, by keeping user-entered field values out of
 * error.message/.stack in the first place (see the throw sites this ships next to, and
 * `scripts/check-telemetry-throw-sites.mjs`, which fails CI if a future one smuggles
 * interpolated field data into a thrown Error) — not by chasing every possible
 * secret-shaped regex here. See TEL-1.
 */
function redact(value: unknown, limit: number): string {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    // The final segment (signature) is optional: an unsigned/`alg:none` JWT has an
    // empty third segment, which `+` (one-or-more) previously failed to match. No
    // trailing \b either: a `\b` immediately after an empty match preceded by the
    // literal "." separator is not a real word-boundary transition (the character
    // before is already non-word, and there is nothing after at end-of-string), so it
    // silently failed to match a trailing-dot JWT even with `*`.
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL REDACTED]')
    // Consume to the next field separator (or end of string), not just to the next
    // space — `password: correct horse battery staple` previously redacted only
    // "correct" and shipped the rest of the passphrase unredacted.
    .replace(/(password|refresh[_-]?token|access[_-]?token|authorization|cookie|secret)\s*[:=]\s*[^,;\n]+/gi, '$1=[REDACTED]')
    .slice(0, limit);
}

function sanitizeContext(raw: unknown): DiagnosticContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const out: DiagnosticContext = {};
  for (const key of ['during', 'operation', 'component', 'componentStack', 'filename', 'route'] as const) {
    if (typeof source[key] === 'string') out[key] = redact(source[key], key === 'componentStack' ? 2_000 : 256);
  }
  if (typeof source.line === 'number' && Number.isFinite(source.line)) out.line = source.line;
  if (typeof source.column === 'number' && Number.isFinite(source.column)) out.column = source.column;
  return Object.keys(out).length > 0 ? out : undefined;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: redact(error.name, 128),
      message: redact(error.message, TEXT_LIMIT),
      stack: error.stack ? redact(error.stack, STACK_LIMIT) : undefined,
    };
  }
  return { name: 'NonError', message: redact(error, TEXT_LIMIT) };
}

export interface ErrorSinkPayload {
  source: AppErrorReport['source'];
  at: number;
  error: SerializedError;
  context?: DiagnosticContext;
  url: string;
  userAgent: string;
  release: string;
}

export function buildPayload(report: AppErrorReport): ErrorSinkPayload {
  return {
    source: report.source,
    at: report.at,
    error: serializeError(report.error),
    context: sanitizeContext(report.context),
    url: typeof location === 'undefined' ? '' : location.pathname,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    release: import.meta.env.MODE,
  };
}

/** Authenticated delivery. sendBeacon cannot attach App Check, so keepalive fetch is used. */
async function post(url: string, payload: ErrorSinkPayload): Promise<void> {
  try {
    const token = await getBackendAppCheckToken();
    if (!token) return;
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': token,
      },
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
    void post(url, payload);
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
