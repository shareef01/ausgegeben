import { useRef, useState, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from '@/i18n';
import { IconDelete, IconEdit, IconLayers } from '@/components/Icons';

interface SwipeableRowProps {
  children: ReactNode;
  onDelete: () => void;
  onTap?: () => void;
  onLongPress?: () => void;
  onDuplicate?: () => void;
  ariaLabel?: string;
}

const SWIPE_THRESHOLD = 80;
const SWIPE_OPEN = 120;
const TAP_SLOP = 6;
const LONG_PRESS_MS = 500;

export function SwipeableRow({ children, onDelete, onTap, onLongPress, onDuplicate, ariaLabel }: SwipeableRowProps) {
  const { t } = useTranslation();
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swipeAxis = useRef<'none' | 'x' | 'y'>('none');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pointerId = useRef(-1);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const applyOffset = useCallback((value: number) => {
    offsetRef.current = value;
    setDragOffset(value);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    swipeAxis.current = 'none';
    longPressFired.current = false;

    try { contentRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        applyOffset(0);
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointerId.current === -1 || longPressFired.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (swipeAxis.current === 'none') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX > TAP_SLOP || absY > TAP_SLOP) {
        swipeAxis.current = absX >= absY ? 'x' : 'y';
        if (swipeAxis.current === 'x') {
          clearLongPress();
          setDragging(true);
        }
      }
    }

    if (swipeAxis.current === 'y') {
      clearLongPress();
      return;
    }

    if (swipeAxis.current === 'x') {
      const limitedOffset = Math.max(-SWIPE_OPEN, Math.min(dx, SWIPE_OPEN));
      applyOffset(limitedOffset);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (pointerId.current === -1) return;
    clearLongPress();

    try { contentRef.current?.releasePointerCapture(e.pointerId); } catch { /* ok */ }

    const currentOffset = offsetRef.current;
    const axis = swipeAxis.current;

    setDragging(false);
    applyOffset(0);
    pointerId.current = -1;
    swipeAxis.current = 'none';

    if (!longPressFired.current) {
      if (axis === 'x') {
        if (currentOffset <= -SWIPE_THRESHOLD) {
          onDelete();
        } else if (currentOffset >= SWIPE_THRESHOLD) {
          onTap?.();
        }
      } else if (axis === 'none') {
        onTap?.();
      }
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap?.();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete();
    }
  };

  // Only show the background for the direction the user is actually swiping
  const swipingLeft = dragOffset < -10;
  const swipingRight = dragOffset > 10;
  const deleteProgress = swipingLeft ? Math.min(Math.abs(dragOffset) / SWIPE_OPEN, 1) : 0;
  const editProgress = swipingRight ? Math.min(dragOffset / SWIPE_OPEN, 1) : 0;

  return (
    <div className="swipeable-row">
      {/* Delete background — slides in from right edge, red */}
      <div
        className={`swipeable-row__bg swipeable-row__bg--delete ${swipingLeft && deleteProgress > 0.3 ? 'swipeable-row__bg--active' : ''}`}
        style={{
          opacity: deleteProgress,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <span className="swipeable-row__bg-content">
          <IconDelete width={20} height={20} />
          <span>{t('recordSwipeDelete')}</span>
        </span>
      </div>

      {/* Edit background — slides in from left edge, accent */}
      <div
        className={`swipeable-row__bg swipeable-row__bg--edit ${swipingRight && editProgress > 0.3 ? 'swipeable-row__bg--active' : ''}`}
        style={{
          opacity: editProgress,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <span className="swipeable-row__bg-content">
          <IconEdit width={16} height={16} />
          <span>{t('editOrTap')}</span>
        </span>
      </div>

      <div
        className="swipeable-row__actions"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onTap ? (
          <button
            type="button"
            className="swipeable-row__action"
            aria-label={t('editOrTap')}
            onClick={onTap}
          >
            <IconEdit width={16} height={16} aria-hidden />
          </button>
        ) : null}
        {onDuplicate ? (
          <button
            type="button"
            className="swipeable-row__action"
            aria-label={t('recordDuplicate')}
            onClick={onDuplicate}
          >
            <IconLayers width={16} height={16} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="swipeable-row__action swipeable-row__action--danger"
          aria-label={t('recordSwipeDelete')}
          onClick={onDelete}
        >
          <IconDelete width={16} height={16} aria-hidden />
        </button>
      </div>

      <div
        ref={contentRef}
        className={`swipeable-row__content ${dragging ? 'swipeable-row__content--dragging' : ''}`}
        style={{
          transform: dragOffset === 0 ? '' : `translate3d(${dragOffset}px, 0, 0)`,
        }}
        role="group"
        tabIndex={0}
        aria-label={ariaLabel ?? t('recordRowActions')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
