import { describe, expect, it } from 'vitest';
import { contrastOn, contrastRatio } from '@/theme/tokens';

describe('contrastOn', () => {
  it('picks white on near-black fills', () => {
    expect(contrastOn('#09090B')).toBe('#FFFFFF');
  });

  it('picks dark ink on light rose expense (not white)', () => {
    expect(contrastOn('#FB7185')).toBe('#09090B');
    expect(contrastRatio('#09090B', '#FB7185')).toBeGreaterThan(
      contrastRatio('#FFFFFF', '#FB7185'),
    );
  });

  it('picks white on dark emerald income', () => {
    expect(contrastOn('#157A3A')).toBe('#FFFFFF');
  });

  it('picks white on lavender accent', () => {
    expect(contrastOn('#7C3AED')).toBe('#FFFFFF');
  });
});
