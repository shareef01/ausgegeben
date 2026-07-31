import { useEffect } from 'react';

/**
 * Lock document body scroll while a modal/sheet is open.
 *
 * Setting `document.body.style.overflow` from here does nothing: ios.css declares
 * `overflow-y: auto !important` on body (it has to, to undo an inherited lock), and
 * an !important rule in a stylesheet outranks a normal inline style. So the lock is
 * a class, which wins on specificity while still being !important.
 *
 * The class also pins the body with `position: fixed`, because overflow alone has
 * never reliably held on iOS Safari — the page scrolls behind the sheet anyway. That
 * costs the scroll position, so it is captured on the first lock, applied as a
 * negative offset to keep the page visually still, and restored on the last unlock.
 */
const LOCK_CLASS = 'is-scroll-locked';
const OFFSET_VAR = '--scroll-lock-top';

// Views like Categories and Settings lock unconditionally and can open a
// ConfirmDialog on top, so locks nest. Count them: releasing on the inner
// dialog's unmount would unlock early and restore a stale scroll position.
let lockCount = 0;
let savedScrollY = 0;

function lockBody(): void {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.setProperty(OFFSET_VAR, `-${savedScrollY}px`);
    document.body.classList.add(LOCK_CLASS);
  }
  lockCount += 1;
}

function unlockBody(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.classList.remove(LOCK_CLASS);
    document.body.style.removeProperty(OFFSET_VAR);
    window.scrollTo(0, savedScrollY);
  }
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockBody();
    return unlockBody;
  }, [locked]);
}
