import { useRef, type PointerEvent, type ReactNode } from 'react';
import { hapticLight } from '@/utils/haptics';

const SWIPE_COMMIT_PX = 72;

interface TabSwipeSurfaceProps {
  children: ReactNode;
  canSwipeToPrevious: boolean;
  canSwipeToNext: boolean;
  onSwipeToPrevious: () => void;
  onSwipeToNext: () => void;
}

function useHorizontalSwipe(
  enabled: boolean,
  onSwipeToPrevious: (() => void) | null,
  onSwipeToNext: (() => void) | null,
) {
  const total = useRef(0);

  if (!enabled) {
    return {
      onPointerDown: undefined,
      onPointerMove: undefined,
      onPointerUp: undefined,
      onPointerCancel: undefined,
    };
  }

  return {
    onPointerDown: () => {
      total.current = 0;
    },
    onPointerMove: (event: PointerEvent) => {
      if (event.buttons === 0) return;
      const dx = event.movementX;
      const dy = event.movementY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          total.current += dx;
        }
      }
    },
    onPointerUp: () => {
      if (total.current > SWIPE_COMMIT_PX) {
        hapticLight();
        onSwipeToPrevious?.();
      } else if (total.current < -SWIPE_COMMIT_PX) {
        hapticLight();
        onSwipeToNext?.();
      }
      total.current = 0;
    },
    onPointerCancel: () => {
      total.current = 0;
    },
  };
}

function TabSwipeBand({
  className,
  enabled,
  onSwipeToPrevious,
  onSwipeToNext,
}: {
  className: string;
  enabled: boolean;
  onSwipeToPrevious: (() => void) | null;
  onSwipeToNext: (() => void) | null;
}) {
  const handlers = useHorizontalSwipe(enabled, onSwipeToPrevious, onSwipeToNext);
  return (
    <div
      className={className}
      aria-hidden
      {...handlers}
    />
  );
}

export function TabSwipeSurface({
  children,
  canSwipeToPrevious,
  canSwipeToNext,
  onSwipeToPrevious,
  onSwipeToNext,
}: TabSwipeSurfaceProps) {
  return (
    <div className="tab-swipe-surface">
      {children}
      <TabSwipeBand
        className="tab-swipe-band tab-swipe-band--start"
        enabled={canSwipeToPrevious}
        onSwipeToPrevious={onSwipeToPrevious}
        onSwipeToNext={null}
      />
      <TabSwipeBand
        className="tab-swipe-band tab-swipe-band--end"
        enabled={canSwipeToNext}
        onSwipeToPrevious={null}
        onSwipeToNext={onSwipeToNext}
      />
      <TabSwipeBand
        className="tab-swipe-band tab-swipe-band--title"
        enabled={canSwipeToPrevious || canSwipeToNext}
        onSwipeToPrevious={canSwipeToPrevious ? onSwipeToPrevious : null}
        onSwipeToNext={canSwipeToNext ? onSwipeToNext : null}
      />
    </div>
  );
}
