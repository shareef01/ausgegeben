/** Last-write-wins for `users/{uid}/settings/preferences.updatedAt`. Equal clocks are a no-op. */
export type PrefsLwwAction = 'apply_remote' | 'push_local' | 'hold';

export function prefsLwwAction(remoteUpdatedAt: number, localUpdatedAt: number): PrefsLwwAction {
  if (remoteUpdatedAt > localUpdatedAt) return 'apply_remote';
  if (localUpdatedAt > remoteUpdatedAt) return 'push_local';
  return 'hold';
}
