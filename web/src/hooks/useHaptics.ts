import { useCallback } from 'react';

export function useHaptics() {
  const vibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const light = useCallback(() => vibrate(10), [vibrate]);
  const medium = useCallback(() => vibrate(15), [vibrate]);
  const success = useCallback(() => vibrate([10, 30, 10]), [vibrate]);
  const heavy = useCallback(() => vibrate(30), [vibrate]);

  return { light, medium, success, heavy };
}
