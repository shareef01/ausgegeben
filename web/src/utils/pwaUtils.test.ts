import { describe, expect, it } from 'vitest';
import { canShowIosInstallHint, isIosDevice, isStandalonePwa } from '@/utils/pwaUtils';

describe('pwaUtils', () => {
  it('exports detection helpers', () => {
    expect(typeof isStandalonePwa()).toBe('boolean');
    expect(typeof isIosDevice()).toBe('boolean');
    expect(typeof canShowIosInstallHint()).toBe('boolean');
  });

  it('does not show iOS install hint when already standalone', () => {
    if (!isIosDevice()) return;
    if (isStandalonePwa()) {
      expect(canShowIosInstallHint()).toBe(false);
    }
  });
});
