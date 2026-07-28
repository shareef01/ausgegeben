import { useLayoutEffect, useRef, type RefObject } from 'react';

type CssProps = Record<string, string | number | undefined | null>;

function toKebab(key: string): string {
  if (key.startsWith('--')) return key;
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function toCssValue(key: string, value: string | number): string {
  if (typeof value === 'number' && !key.startsWith('--') && /^(width|height|top|left|right|bottom|min-width|min-height|max-width|max-height|font-size|border-radius)$/i.test(toKebab(key))) {
    return `${value}px`;
  }
  return String(value);
}

/**
 * Set styles via the CSSOM (not an HTML style="" attribute) so CSP
 * style-src-attr can omit 'unsafe-inline'.
 */
export function applyCss(el: Element | null | undefined, props: CssProps): void {
  if (!el || !(el instanceof HTMLElement || el instanceof SVGElement)) return;
  for (const [key, value] of Object.entries(props)) {
    const cssKey = toKebab(key);
    if (value == null || value === '') {
      el.style.removeProperty(cssKey);
    } else {
      el.style.setProperty(cssKey, toCssValue(key, value));
    }
  }
}

/** Ref that keeps CSSOM properties in sync with `props`. */
export function useCssProps<T extends HTMLElement | SVGElement>(props: CssProps): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const serialized = JSON.stringify(props);
  useLayoutEffect(() => {
    applyCss(ref.current, JSON.parse(serialized) as CssProps);
  }, [serialized]);
  return ref;
}
