import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { useTranslation } from '@/i18n';

interface SwipeableRowProps {
  children: ReactNode;
  onDelete: () => void;
  onLongPress?: () => void;
}

const SWIPE_THRESHOLD = 72;
const LONG_PRESS_MS = 500;

export function SwipeableRow({ children, onDelete, onLongPress }: SwipeableRowProps) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    tracking.current = true;
    longPressFired.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!tracking.current || longPressFired.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      clearLongPress();
      return;
    }
    if (Math.abs(dx) > 8) clearLongPress();
    if (dx < 0) setOffset(Math.max(dx, -120));
    else setOffset(0);
  };

  const onPointerUp = () => {
    tracking.current = false;
    clearLongPress();
    if (longPressFired.current) {
      setOffset(0);
      return;
    }
    if (offset <= -SWIPE_THRESHOLD) {
      onDelete();
    }
    setOffset(0);
  };

  return (
    <div className="swipeable-row">
      <div className="swipeable-row__bg" aria-hidden>
        <span>{t('recordSwipeDelete')}</span>
      </div>
      <div
        className="swipeable-row__content"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
