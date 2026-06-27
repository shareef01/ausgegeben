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
  const offsetRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const applyOffset = (value: number, commitState = false) => {
    offsetRef.current = value;
    if (contentRef.current) {
      contentRef.current.style.transform = value === 0 ? '' : `translateX(${value}px)`;
    }
    if (commitState) {
      setOffset(value);
    }
  };

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
    contentRef.current?.classList.add('swipeable-row__content--dragging');
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
    if (dx < 0) applyOffset(Math.max(dx, -120));
    else applyOffset(0);
  };

  const onPointerUp = () => {
    tracking.current = false;
    clearLongPress();
    contentRef.current?.classList.remove('swipeable-row__content--dragging');
    if (longPressFired.current) {
      applyOffset(0, true);
      return;
    }
    if (offsetRef.current <= -SWIPE_THRESHOLD) {
      onDelete();
    }
    applyOffset(0, true);
  };

  return (
    <div className="swipeable-row">
      <div className="swipeable-row__bg" aria-hidden>
        <span>{t('recordSwipeDelete')}</span>
      </div>
      <div
        ref={contentRef}
        className="swipeable-row__content"
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
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
