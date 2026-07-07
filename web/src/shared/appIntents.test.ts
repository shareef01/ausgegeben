import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  consumeOpenAddQueryParam,
  dispatchOpenAddIntent,
  OPEN_ADD_INTENT_EVENT,
  OPEN_ADD_QUERY_PARAM,
} from '@/shared/appIntents';

describe('appIntents', () => {
  let href = 'http://localhost/record';
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    href = 'http://localhost/record';
    listeners.clear();

    vi.stubGlobal('window', {
      location: {
        get pathname() {
          return new URL(href).pathname;
        },
        get search() {
          return new URL(href).search;
        },
      },
      history: {
        replaceState: (_state: unknown, _title: unknown, url: string) => {
          href = new URL(url, 'http://localhost').href;
        },
      },
      focus: vi.fn(),
      addEventListener: (type: string, handler: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener: (type: string, handler: EventListener) => {
        listeners.get(type)?.delete(handler);
      },
      dispatchEvent: (event: Event) => {
        listeners.get(event.type)?.forEach((handler) => handler(event));
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('consumeOpenAddQueryParam strips the query flag', () => {
    href = `http://localhost/record?${OPEN_ADD_QUERY_PARAM}=1`;

    expect(consumeOpenAddQueryParam()).toBe(true);
    expect(new URL(href).pathname).toBe('/record');
    expect(new URL(href).search).toBe('');
    expect(consumeOpenAddQueryParam()).toBe(false);
  });

  it('dispatchOpenAddIntent fires a window event', () => {
    let fired = false;
    const handler = () => {
      fired = true;
    };
    window.addEventListener(OPEN_ADD_INTENT_EVENT, handler);
    dispatchOpenAddIntent();
    window.removeEventListener(OPEN_ADD_INTENT_EVENT, handler);
    expect(fired).toBe(true);
  });
});
