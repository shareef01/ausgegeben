import { useEffect } from 'react';
import { lockSheetScroll } from '@/utils/sheetScrollLock';

export function useSheetScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    return lockSheetScroll();
  }, [active]);
}
