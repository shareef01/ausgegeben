import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, createEndpointSink } from '@/services/errorSink';
import type { AppErrorReport } from '@/services/errorReporter';

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
});
