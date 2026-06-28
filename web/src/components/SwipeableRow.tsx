import { useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { useTranslation } from '@/i18n';

interface SwipeableRowProps {
  children: ReactNode;
  onDelete: () => void;
  onTap?: () => void;
  onLongPress?: () => void;
}

const SWIPE_THRESHOLD = 72;
const SWIPE_OPEN = 88;
const TAP_SLOP = 10;
const LONG_PRESS_MS = 500;

export function SwipeableRow({ children, onDelete, onTap, onLongPress }: SwipeableRowProps) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const swipeAxis = useRef<'none' | 'x' | 'y'>('none');
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
    swipeAxis.current = 'none';
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

    if (swipeAxis.current === 'none' && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) {
      swipeAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }

    if (swipeAxis.current === 'y') {
      clearLongPress();
      // If we are scrolling vertically, release the pointer so the browser can scroll
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      tracking.current = false;
      return;
    }

    if (swipeAxis.current === 'x') {
      clearLongPress();
      // Law: Dual-axis swipe support (Edit on right-swipe, Delete on left-swipe)
      applyOffset(Math.max(-SWIPE_OPEN, Math.min(dx, SWIPE_OPEN)));
    }
  };

  const onPointerUp = () => {
    tracking.current = false;
    clearLongPress();
    contentRef.current?.classList.remove('swipeable-row__content--dragging');

    if (longPressFired.current) {
      applyOffset(0, true);
      swipeAxis.current = 'none';
      return;
    }

    const movedX = swipeAxis.current === 'x';
    const current = offsetRef.current;

    if (movedX) {
      if (current <= -SWIPE_THRESHOLD) {
        onDelete();
        applyOffset(0, true);
      } else if (current >= SWIPE_THRESHOLD) {
        if (onTap) onTap(); // Law: Tap is now a Swipe-Right gesture
        applyOffset(0, true);
      } else {
        applyOffset(0, true);
      }
    } else {
      applyOffset(0, true);
    }

    swipeAxis.current = 'none';
  };

  return (
    <div className="swipeable-row">
      <div className={`swipeable-row__bg swipeable-row__bg--delete ${offset < 0 ? 'visible' : ''}`} aria-hidden>
        <span>{t('recordSwipeDelete')}</span>
      </div>
      <div className={`swipeable-row__bg swipeable-row__bg--edit ${offset > 0 ? 'visible' : ''}`} aria-hidden>
        <span>{t('actionEdit')}</span>
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
