import { useEffect, useRef, useState } from 'react';

/** Toggles a glass background on sticky screen headers while `.app-main` scrolls. */
export function useStickyGlassHeader() {
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;

    const scrollRoot = header.closest('.app-main') as HTMLElement | null;
    if (!scrollRoot) return;

    const onScroll = () => setScrolled(scrollRoot.scrollTop > 6);
    onScroll();
    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', onScroll);
  }, []);

  return { ref, scrolled };
}
