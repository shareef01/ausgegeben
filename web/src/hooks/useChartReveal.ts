import { useEffect, useState } from 'react';

const DURATION_MS = 480;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Spring-like chart entrance progress (0 → 1), keyed to data changes. */
export function useChartReveal(animationKey: string | number, enabled = true): number {
  const [progress, setProgress] = useState(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animationKey, enabled]);

  return progress;
}
