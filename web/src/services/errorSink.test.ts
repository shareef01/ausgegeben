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

  it('sends the report to the configured endpoint', () => {
    createEndpointSink(URL_UNDER_TEST)(report());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe(URL_UNDER_TEST);
    expect(JSON.parse(String(init?.body)).error.message).toBe('boom');
  });

  // A crash loop repeats one error endlessly; the endpoint should hear it once.
  it('sends an identical error only once', () => {
    const sink = createEndpointSink(URL_UNDER_TEST);

    sink(report());
    sink(report());
    sink(report());

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops after the per-session cap even for distinct errors', () => {
    const sink = createEndpointSink(URL_UNDER_TEST);

    for (let i = 0; i < 25; i++) sink(report({ error: new Error(`distinct-${i}`) }));

    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('prefers sendBeacon so a report survives the tab closing', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon });

    createEndpointSink(URL_UNDER_TEST)(report());

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to fetch when sendBeacon refuses the payload', () => {
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon: vi.fn(() => false) });

    createEndpointSink(URL_UNDER_TEST)(report());

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never throws when delivery fails', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    expect(() => createEndpointSink(URL_UNDER_TEST)(report())).not.toThrow();
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
