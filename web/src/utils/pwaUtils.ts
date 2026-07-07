export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Safari on iOS — no beforeinstallprompt; show manual home-screen steps. */
export function canShowIosInstallHint(): boolean {
  return isIosDevice() && !isStandalonePwa();
}
