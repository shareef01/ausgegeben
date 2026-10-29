import { useSyncExternalStore } from 'react';
import { getThemeRevision, subscribeThemeRevision } from '@/theme/tokens';

/**
 * A number that changes whenever the palette is re-applied. Put it in the deps of any memo
 * that reads resolved theme colours (getComputedStyle, `data-theme`) so it recomputes.
 */
export function useThemeRevision(): number {
  return useSyncExternalStore(subscribeThemeRevision, getThemeRevision, getThemeRevision);
}
