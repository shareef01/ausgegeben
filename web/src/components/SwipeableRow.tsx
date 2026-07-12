import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
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
  const pointerId = useRef(-1);

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

  const resetTracking = () => {
    tracking.current = false;
    swipeAxis.current = 'none';
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const el = contentRef.current;
    if (!el) return;
    tracking.current = true;
    swipeAxis.current = 'none';
    longPressFired.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer may not be active yet */ }
    el.classList.add('swipeable-row__content--dragging');
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!tracking.current || longPressFired.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (swipeAxis.current === 'none' && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) {
      swipeAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }

    if (swipeAxis.current === 'y') {
      clearLongPress();
      try { contentRef.current?.releasePointerCapture(pointerId.current); } catch { /* ok */ }
      resetTracking();
      return;
    }

    if (swipeAxis.current === 'x') {
      clearLongPress();
      applyOffset(Math.max(-SWIPE_OPEN, Math.min(dx, SWIPE_OPEN)));
    }
  };

  const onPointerUp = () => {
    clearLongPress();
    contentRef.current?.classList.remove('swipeable-row__content--dragging');

    if (longPressFired.current) {
      applyOffset(0, true);
      resetTracking();
      return;
    }

    const movedX = swipeAxis.current === 'x';
    const current = offsetRef.current;

    if (movedX) {
      if (current <= -SWIPE_THRESHOLD) {
        onDelete();
      } else if (current >= SWIPE_THRESHOLD) {
        onTap?.();
      }
    }

    applyOffset(0, true);
    resetTracking();
  };

  return (
    <div className="swipeable-row">
      <div className={`swipeable-row__bg swipeable-row__bg--delete ${offset < 0 ? 'visible' : ''}`} aria-hidden>
        <span>{t('recordSwipeDelete')}</span>
      </div>
      <div className={`swipeable-row__bg swipeable-row__bg--edit ${offset > 0 ? 'visible' : ''}`} aria-hidden>
        <span>{t('actionSave')}</span>
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
