import { describe, expect, it } from 'vitest';
import { forChartDisplayHex, chartColorAt } from '@/utils/chartColors';

describe('chartColors', () => {
  it('falls back to palette for very dark category colors', () => {
    expect(forChartDisplayHex(0xff000000, 0)).toBe(chartColorAt(0));
    expect(forChartDisplayHex(0xff101010, 2)).toBe(chartColorAt(2));
  });

  it('boosts mid-dark colors for chart legibility', () => {
    const boosted = forChartDisplayHex(0xff303030, 0);
    expect(boosted).not.toBe('#303030');
    expect(boosted.startsWith('#')).toBe(true);
  });

  it('softens very bright colors', () => {
    const softened = forChartDisplayHex(0xfffefefe, 0);
    expect(softened).not.toBe('#fefefe');
  });
});
