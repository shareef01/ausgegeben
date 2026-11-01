import { afterEach, describe, expect, it } from 'vitest';
import { buildPayload } from '@/services/errorSink';
import { resetErrorReporter, type AppErrorReport } from '@/services/errorReporter';

/**
 * Telemetry data minimisation, exercised through the real payload builder with synthetic
 * sensitive values. The boundary has three layers and this pins each one:
 *
 *  1. `DiagnosticContext` is a closed type, and `buildPayload` re-allowlists its keys at
 *     runtime — a caller that slips financial fields into the context object (a JS consumer, an
 *     `as any`, a future refactor) has them dropped rather than shipped.
 *  2. Credential-shaped text inside the error is redacted.
 *  3. Free text is *not* filtered. That is deliberate (see `redact` and the TEL-1 guard) and is
 *     asserted here so the limitation stays visible and any change to it is a conscious one.
 */
const SINK: AppErrorReport = { source: 'manual', error: null, at: 1_700_000_000_000 };

function payloadFor(error: unknown, context?: Record<string, unknown>) {
  return buildPayload({ ...SINK, error, context: context as never });
}

describe('telemetry data minimisation', () => {
  afterEach(() => resetErrorReporter());

  it('drops financial and account fields from the diagnostic context', () => {
    const payload = payloadFor(new Error('boom'), {
      during: 'restore',
      route: '/settings',
      // Everything below is not in DiagnosticContext and must never reach the endpoint.
      amount: 1234.56,
      note: 'Therapy session',
      categoryName: 'Divorce lawyer',
      categoryId: 'cat-1',
      uid: 'user-abc',
      email: 'someone@example.com',
      token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.',
      backup: '{"expenses":[]}',
    });

    expect(payload.context).toEqual({ during: 'restore', route: '/settings' });
    const serialized = JSON.stringify(payload);
    for (const secret of ['1234.56', 'Therapy', 'Divorce', 'cat-1', 'user-abc', 'someone@example.com']) {
      expect(serialized, secret).not.toContain(secret);
    }
  });

  it('redacts credential-shaped text even inside an allowlisted field', () => {
    const payload = payloadFor(new Error('failed'), {
      during: 'auth someone@example.com password: hunter2 Bearer abc.def.ghi',
    });
    expect(payload.context?.during).not.toContain('someone@example.com');
    expect(payload.context?.during).not.toContain('hunter2');
    expect(payload.context?.during).not.toContain('abc.def.ghi');
  });

  it('redacts credentials in the error message and stack', () => {
    const error = new Error(
      'request failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2ln refresh_token=abcd1234 for someone@example.com',
    );
    const payload = payloadFor(error);
    const text = `${payload.error.message} ${payload.error.stack ?? ''}`;
    expect(text).not.toContain('someone@example.com');
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(text).not.toContain('abcd1234');
    // `refresh_token=...` consumes to the end of the field, so the marker can be either the
    // credential one or the email one — what matters is that no secret survives.
    expect(text).toContain('[REDACTED]');
  });

  it('does not filter financial free text — the documented limitation TEL-1 exists for', () => {
    // If this ever starts passing with the amount removed, update the comment on `redact()` and
    // the TEL-1 guard rationale: the design currently relies on throw sites never interpolating
    // user-entered values, not on the sink recognising them.
    const payload = payloadFor(new Error('amount 1234.56 note "Therapy session" category "Divorce lawyer"'));
    expect(payload.error.message).toContain('1234.56');
    expect(payload.error.message).toContain('Therapy session');
  });

  it('caps message and stack length so a payload cannot become a data dump', () => {
    const payload = payloadFor(new Error('x'.repeat(20_000)));
    expect(payload.error.message.length).toBeLessThanOrEqual(1_000);
    expect((payload.error.stack ?? '').length).toBeLessThanOrEqual(4_000);
  });
});
