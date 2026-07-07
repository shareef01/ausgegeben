import { describe, expect, it } from 'vitest';
import { contrastColorOn } from './tokens';

describe('contrastColorOn', () => {
  it('returns dark glyph on light fills', () => {
    expect(contrastColorOn('#FFFFFF')).toBe('#09090B');
    expect(contrastColorOn('#FAFAFA')).toBe('#09090B');
    expect(contrastColorOn('#E4E4E7')).toBe('#09090B');
  });

  it('returns white glyph on dark fills', () => {
    expect(contrastColorOn('#09090B')).toBe('#FFFFFF');
    expect(contrastColorOn('#000000')).toBe('#FFFFFF');
    expect(contrastColorOn('#18181B')).toBe('#FFFFFF');
  });
});
