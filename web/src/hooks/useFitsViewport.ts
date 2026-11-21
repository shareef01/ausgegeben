import { useEffect, useState, type RefObject } from 'react';

/**
 * True while the element (plus `margin` px) is no taller than the window.
 *
 * Sticky side columns use it to stick only when they fit: a sticky box taller than the window
 * either hides its bottom until the page ends or, capped with `max-height`, becomes a second
 * scroll area inside the page. CSS cannot compare an element's height with the viewport, so
 * this measures it and re-measures on resize and content changes.
 */
export function useFitsViewport(ref: RefObject<HTMLElement | null>, enabled: boolean, margin = 32): boolean {
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      setFits(false);
      return;
    }
    const update = () => setFits(el.offsetHeight + margin <= window.innerHeight);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, enabled, margin]);

  return fits;
}
