export type ShellTab = 'record' | 'insights' | 'settings';

export type ShellOverlay =
  | null
  | { type: 'add'; openCamera?: boolean }
  | { type: 'edit'; expenseId: number }
  | { type: 'categories' };

const TABS: ShellTab[] = ['record', 'insights', 'settings'];

function isShellTab(value: string): value is ShellTab {
  return TABS.includes(value as ShellTab);
}

function parseRouteParts(parts: string[]): { tab: ShellTab; overlay: ShellOverlay } {
  if (parts.length === 0) {
    return { tab: 'record', overlay: null };
  }

  const tabPart = parts[0];
  if (!isShellTab(tabPart)) {
    return { tab: 'record', overlay: null };
  }

  const tab = tabPart;
  const action = parts[1];

  if (action === 'add') {
    return { tab, overlay: { type: 'add' } };
  }
  if (action === 'categories') {
    return { tab: 'settings', overlay: { type: 'categories' } };
  }
  if (action === 'edit') {
    const expenseId = Number(parts[2]);
    if (Number.isFinite(expenseId) && expenseId > 0) {
      return { tab, overlay: { type: 'edit', expenseId } };
    }
  }

  return { tab, overlay: null };
}

export function parseShellPath(pathname: string): { tab: ShellTab; overlay: ShellOverlay } {
  const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  return parseRouteParts(parts);
}

/** @deprecated Legacy hash URLs — still parsed for old bookmarks. */
export function parseShellHash(hash: string): { tab: ShellTab; overlay: ShellOverlay } {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return parseRouteParts(parts);
}

export function buildShellPath(tab: ShellTab, overlay: ShellOverlay): string {
  if (overlay?.type === 'add') return `/${tab}/add`;
  if (overlay?.type === 'categories') return '/settings/categories';
  if (overlay?.type === 'edit') return `/${tab}/edit/${overlay.expenseId}`;
  return `/${tab}`;
}

export function readShellRoute(): { tab: ShellTab; overlay: ShellOverlay } {
  if (typeof window === 'undefined') {
    return { tab: 'record', overlay: null };
  }
  const { pathname, hash } = window.location;
  if (pathname && pathname !== '/') {
    return parseShellPath(pathname);
  }
  if (hash) {
    return parseShellHash(hash);
  }
  return { tab: 'record', overlay: null };
}

/** True when a different Firebase user signs in and local IndexedDB must be cleared first. */
export function shouldClearLocalDataBeforeSync(
  lastCloudUserId: string | null,
  nextUid: string,
): boolean {
  return Boolean(lastCloudUserId && lastCloudUserId !== nextUid);
}

/** Use history.back() when the overlay was opened in-session (not a deep link). */
export function shouldHistoryBackOnOverlayClose(overlayPushed: boolean, hasOverlay: boolean): boolean {
  return overlayPushed && hasOverlay;
}
