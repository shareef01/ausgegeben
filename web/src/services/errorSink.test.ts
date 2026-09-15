import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyErrorReportingPreference,
  buildPayload,
  createEndpointSink,
  installConfiguredErrorSink,
} from '@/services/errorSink';
import { writeErrorReportingEnabled } from '@/services/errorReportPreference';
import {
  reportError,
  resetErrorReporter,
  setErrorSink,
  type AppErrorReport,
} from '@/services/errorReporter';
import { getBackendAppCheckToken } from '@/services/firebase';

vi.mock('@/services/firebase', () => ({
  getBackendAppCheckToken: vi.fn(async () => 'valid-app-check-token'),
}));

const URL_UNDER_TEST = 'https://example.test/report';

function report(overrides: Partial<AppErrorReport> = {}): AppErrorReport {
  return { source: 'render', error: new Error('boom'), at: 1_700_000_000_000, ...overrides };
}

describe('errorSink', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'test-agent' });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
  });

  afterEach(() => {
    writeErrorReportingEnabled(true);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serializes an Error into name, message and stack', () => {
    const payload = buildPayload(report());

    expect(payload.error.name).toBe('Error');
    expect(payload.error.message).toBe('boom');
    expect(payload.error.stack).toBeTruthy();
    expect(payload.source).toBe('render');
  });

  it('serializes a thrown non-Error without losing it', () => {
    const payload = buildPayload(report({ error: 'just a string' }));

    expect(payload.error.name).toBe('NonError');
    expect(payload.error.message).toBe('just a string');
  });

  it('allowlists context and redacts identity, credentials, and tokens', () => {
    const payload = buildPayload(report({
      error: new Error('user alice@example.com Authorization: Bearer abc.def.ghi password=hunter2'),
      context: {
        operation: 'bootstrap for alice@example.com',
        // Runtime defense must drop fields even when an unsafe caller bypasses TypeScript.
        amount: 99.95,
        note: 'private memo',
        uid: 'account-123',
        refreshToken: 'secret-token',
      } as never,
    }));
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('private memo');
    expect(serialized).not.toContain('account-123');
    expect(serialized).not.toContain('secret-token');
    expect(payload.context?.operation).toContain('[EMAIL REDACTED]');
  });

  it('sends the report to the configured endpoint with App Check', async () => {
    createEndpointSink(URL_UNDER_TEST)(report());

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(URL_UNDER_TEST);
    expect(JSON.parse(String(init?.body)).error.message).toBe('boom');
    expect(new Headers(init?.headers).get('X-Firebase-AppCheck')).toBe('valid-app-check-token');
  });

  // A crash loop repeats one error endlessly; the endpoint should hear it once.
  it('sends an identical error only once', async () => {
    const sink = createEndpointSink(URL_UNDER_TEST);

    sink(report());
    sink(report());
    sink(report());

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('stops after the per-session cap even for distinct errors', async () => {
    const sink = createEndpointSink(URL_UNDER_TEST);

    for (let i = 0; i < 25; i++) sink(report({ error: new Error(`distinct-${i}`) }));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(10));
  });

  it('drops the report when App Check cannot produce a token', async () => {
    vi.mocked(getBackendAppCheckToken).mockResolvedValueOnce(null);
    createEndpointSink(URL_UNDER_TEST)(report());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never throws when delivery fails', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    expect(() => createEndpointSink(URL_UNDER_TEST)(report())).not.toThrow();
  });

  // TEL-1: redaction is credential-shaped, not a PII/financial-data filter. These pin
  // the two real regex bugs that are now fixed, and explicitly document the two known,
  // accepted gaps (structural prevention — keeping field data out of throw sites in
  // the first place, not chasing every possible secret-shaped regex — is the actual
  // defense; see scripts/check-telemetry-throw-sites.mjs).
  describe('redaction bypass strings (TEL-1)', () => {
    it('redacts a multi-word secret in full, not just its first token (fixed)', () => {
      const payload = buildPayload(report({
        error: new Error('password: correct horse battery staple'),
      }));
      expect(payload.error.message).not.toContain('horse battery staple');
    });

    it('redacts a JWT with an empty trailing (unsigned) segment (fixed)', () => {
      const payload = buildPayload(report({
        error: new Error('token was eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.'),
      }));
      expect(payload.error.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(payload.error.message).toContain('[JWT REDACTED]');
    });

    it('does NOT redact a bare-hostname email like admin@localhost (known, accepted gap)', () => {
      const payload = buildPayload(report({ error: new Error('sent from admin@localhost') }));
      // Documenting current behavior, not asserting it is desirable — the email regex
      // requires a dotted TLD by design, matching the shape of a real email address.
      expect(payload.error.message).toContain('admin@localhost');
    });

    it('does NOT redact credential-shaped keys outside the fixed keyword list, e.g. sid= (known, accepted gap)', () => {
      const payload = buildPayload(report({ error: new Error('sid=abc123 x-api-key=sk_live_1') }));
      // Documenting current behavior — chasing every possible key name is the "endless
      // regexes" this design deliberately avoids; see the module doc comment on redact().
      expect(payload.error.message).toContain('sid=abc123');
      expect(payload.error.message).toContain('sk_live_1');
    });

    it('does not redact ordinary financial free text — it is not credential-shaped (known, accepted gap)', () => {
      const payload = buildPayload(report({
        error: new Error('refund of $4,532.10 to merchant "Acme Corp" invoice INV-2024-0088'),
      }));
      // This is exactly why structural prevention matters more here than more regexes:
      // no regex over the message string can distinguish "safe free text" from "a
      // leaked note/merchant name" — the fix is never putting one there. See the
      // exhaustive throw-site audit referenced in redact()'s doc comment.
      expect(payload.error.message).toContain('Acme Corp');
    });
  });

  it('does not attach the sink when error reporting is opted out', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubEnv('VITE_ERROR_REPORT_URL', URL_UNDER_TEST);
    writeErrorReportingEnabled(false);

    expect(installConfiguredErrorSink()).toBe(false);
  });
});

describe('error reporting opt-out (AUS-109)', () => {
  beforeEach(() => {
    resetErrorReporter();
  });

  /**
   * The opt-out used to only clear the sink while reportError kept filling the replay
   * buffer, so every error captured while reporting was off was transmitted the moment
   * the user turned it back on. A privacy opt-out that defers rather than suppresses is
   * not an opt-out.
   */
  it('does not replay errors captured while reporting was disabled', () => {
    const sent: unknown[] = [];
    setErrorSink((r) => sent.push(r));

    applyErrorReportingPreference(false);
    reportError('manual', new Error('while opted out A'));
    reportError('window', new Error('while opted out B'));
    expect(sent).toHaveLength(0);

    // Re-enabling must not resurrect them. installConfiguredErrorSink() is a no-op
    // without VITE_ERROR_REPORT_URL, so attach one directly to observe any replay.
    applyErrorReportingPreference(true);
    setErrorSink((r) => sent.push(r));
    expect(sent).toHaveLength(0);
  });

  it('still replays pre-sink errors when reporting was never disabled', () => {
    reportError('manual', new Error('startup crash'));
    const sent: unknown[] = [];
    setErrorSink((r) => sent.push(r));
    expect(sent).toHaveLength(1);
  });

  it('resumes buffering after the user opts back in', () => {
    applyErrorReportingPreference(false);
    reportError('manual', new Error('dropped'));
    applyErrorReportingPreference(true);
    reportError('manual', new Error('kept'));
    const sent: unknown[] = [];
    setErrorSink((r) => sent.push(r));
    expect(sent).toHaveLength(1);
  });
});
