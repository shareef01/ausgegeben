import { useRef, type PointerEventHandler } from 'react';

interface LongPressHandlers {
  onPointerDown: PointerEventHandler;
  onPointerUp: PointerEventHandler;
  onPointerCancel: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
}

export function useLongPress(
  onLongPress: (() => void) | undefined,
  onClick: () => void,
  delayMs = 500,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    onPointerDown: () => {
      longPressedRef.current = false;
      clearTimer();
      if (!onLongPress) return;
      timerRef.current = setTimeout(() => {
        longPressedRef.current = true;
        onLongPress();
      }, delayMs);
    },
    onPointerUp: () => {
      clearTimer();
      if (!longPressedRef.current) onClick();
    },
    onPointerCancel: () => {
      clearTimer();
      longPressedRef.current = false;
    },
    onPointerLeave: () => {
      clearTimer();
      longPressedRef.current = false;
    },
  };
}
