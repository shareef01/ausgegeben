import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRecentErrors,
  installGlobalErrorHandlers,
  reportError,
  resetErrorReporter,
  setErrorSink,
  type AppErrorReport,
} from '@/services/errorReporter';

describe('errorReporter', () => {
  beforeEach(() => {
    resetErrorReporter();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetErrorReporter();
    vi.restoreAllMocks();
  });

  it('records reports with their source and context', () => {
    const boom = new Error('boom');
    reportError('render', boom, { componentStack: 'at App' });

    const [report] = getRecentErrors();
    expect(report?.source).toBe('render');
    expect(report?.error).toBe(boom);
    expect(report?.context).toEqual({ componentStack: 'at App' });
  });

  it('replays errors buffered before a sink was attached', () => {
    reportError('manual', new Error('early'));
    const seen: AppErrorReport[] = [];

    setErrorSink((report) => seen.push(report));

    expect(seen).toHaveLength(1);
    expect((seen[0]?.error as Error).message).toBe('early');
  });

  it('forwards errors reported after the sink is attached', () => {
    const sink = vi.fn();
    setErrorSink(sink);

    reportError('window', new Error('late'));

    expect(sink).toHaveBeenCalledTimes(1);
  });

  // A reporter that is itself broken must not turn one error into two.
  it('swallows a throwing sink', () => {
    setErrorSink(() => {
      throw new Error('sink is down');
    });

    expect(() => reportError('manual', new Error('original'))).not.toThrow();
    expect(getRecentErrors()).toHaveLength(1);
  });

  it('caps the buffer so a crash loop cannot grow it without bound', () => {
    for (let i = 0; i < 25; i++) reportError('manual', new Error(`err-${i}`));

    const recent = getRecentErrors();
    expect(recent).toHaveLength(20);
    expect((recent[recent.length - 1]?.error as Error).message).toBe('err-24');
  });

  it('captures window errors and unhandled rejections until removed', () => {
    const target = new EventTarget();
    const remove = installGlobalErrorHandlers(target);

    const errorEvent = Object.assign(new Event('error'), { error: new Error('handler') });
    target.dispatchEvent(errorEvent);
    const rejectionEvent = Object.assign(new Event('unhandledrejection'), {
      reason: new Error('rejected'),
    });
    target.dispatchEvent(rejectionEvent);

    expect(getRecentErrors().map((r) => r.source)).toEqual(['window', 'promise']);

    remove();
    target.dispatchEvent(errorEvent);
    expect(getRecentErrors()).toHaveLength(2);
  });
});
