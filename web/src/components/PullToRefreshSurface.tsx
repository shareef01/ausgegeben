import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { IconSync } from '@/components/Icons';

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;

interface PullToRefreshSurfaceProps {
  enabled: boolean;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  label: string;
  children: ReactNode;
}

function scrollAtTop(): boolean {
  const main = document.getElementById('main-content');
  return !main || main.scrollTop <= 0;
}

export function PullToRefreshSurface({
  enabled,
  refreshing,
  onRefresh,
  label,
  children,
}: PullToRefreshSurfaceProps) {
  const [pull, setPull] = useState(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = (event: TouchEvent) => {
    if (!enabled || refreshing || !scrollAtTop()) return;
    startY.current = event.touches[0].clientY;
    tracking.current = true;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!tracking.current) return;
    const dy = event.touches[0].clientY - startY.current;
    if (dy < 0) {
      setPull(0);
      return;
    }
    if (!scrollAtTop()) {
      tracking.current = false;
      setPull(0);
      return;
    }
    setPull(Math.min(dy * 0.45, MAX_PULL));
  };

  const endPull = () => {
    if (!tracking.current) return;
    tracking.current = false;
    if (pull >= PULL_THRESHOLD) void onRefresh();
    setPull(0);
  };

  const indicatorHeight = refreshing ? 44 : pull;
  const showIndicator = enabled && (refreshing || pull > 8);

  return (
    <div
      className={`pull-refresh${refreshing ? ' pull-refresh--refreshing' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endPull}
      onTouchCancel={endPull}
    >
      {enabled ? (
        <div
          className="pull-refresh__indicator"
          style={{ height: indicatorHeight }}
          aria-hidden={!showIndicator}
        >
          {showIndicator ? (
            <div className="pull-refresh__chip insights-glass-island" role="status" aria-live="polite">
              <IconSync
                width={16}
                height={16}
                className={refreshing ? 'spin' : ''}
                aria-hidden
              />
              <span>{label}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
