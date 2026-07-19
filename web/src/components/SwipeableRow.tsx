import { useRef, useCallback, useEffect, type ReactNode, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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

const TAP_SLOP = 6;
const LONG_PRESS_MS = 500;

export function SwipeableRow({ children, onDelete, onTap, onLongPress, onDuplicate, ariaLabel }: SwipeableRowProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const moved = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pointerId = useRef(-1);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearLongPress();
  }, [clearLongPress]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    moved.current = false;
    longPressFired.current = false;

    try { contentRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointerId.current === -1 || longPressFired.current) return;
    const dx = Math.abs(e.clientX - startX.current);
    const dy = Math.abs(e.clientY - startY.current);
    if (dx > TAP_SLOP || dy > TAP_SLOP) {
      moved.current = true;
      clearLongPress();
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (pointerId.current === -1) return;
    clearLongPress();

    try { contentRef.current?.releasePointerCapture(e.pointerId); } catch { /* ok */ }

    const wasTap = !moved.current && !longPressFired.current;
    pointerId.current = -1;

    if (wasTap) {
      onTap?.();
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

  return (
    <div className="swipeable-row">
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
        className="swipeable-row__content"
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
