import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { hapticLight } from '@/utils/haptics';

const SWIPE_COMMIT_PX = 56;

interface OnboardingPagerProps {
  step: number;
  pageCount: number;
  onStepChange: (next: number) => void;
  children: ReactNode;
}

export function OnboardingPager({ step, pageCount, onStepChange, children }: OnboardingPagerProps) {
  const startX = useRef(0);
  const dragPxRef = useRef(0);
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const goTo = (next: number) => {
    if (next === step || next < 0 || next >= pageCount) return;
    hapticLight();
    onStepChange(next);
  };

  const onPointerDown = (event: PointerEvent) => {
    startX.current = event.clientX;
    setDragging(true);
    dragPxRef.current = 0;
    setDragPx(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    let dx = event.clientX - startX.current;
    if (step === 0 && dx > 0) dx *= 0.35;
    if (step === pageCount - 1 && dx < 0) dx *= 0.35;
    dragPxRef.current = dx;
    setDragPx(dx);
  };

  const finishDrag = (event: PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const offset = dragPxRef.current;
    if (offset > SWIPE_COMMIT_PX && step > 0) {
      goTo(step - 1);
    } else if (offset < -SWIPE_COMMIT_PX && step < pageCount - 1) {
      goTo(step + 1);
    }
    dragPxRef.current = 0;
    setDragPx(0);
  };

  const offset = `calc(-${step * 100}% + ${dragPx}px)`;

  return (
    <div
      className="onboarding-pager"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        className={`onboarding-pager__track${dragging ? ' onboarding-pager__track--dragging' : ''}`}
        style={{ transform: `translateX(${offset})` }}
      >
        {children}
      </div>
    </div>
  );
}
