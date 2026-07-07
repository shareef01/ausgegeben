let lockCount = 0;

/** Clear a stale lock after hot reload or interrupted sheet close. */
export function resetSheetScrollLock(): void {
  if (typeof document === 'undefined') return;
  lockCount = 0;
  document.body.classList.remove('body--sheet-open');
}

/** Lock body scroll while a sheet/modal is open. Supports nested sheets. */
export function lockSheetScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  lockCount += 1;
  if (lockCount === 1) {
    document.body.classList.add('body--sheet-open');
  }
  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.classList.remove('body--sheet-open');
    }
  };
}
