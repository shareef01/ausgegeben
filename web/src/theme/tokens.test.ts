import { describe, expect, it } from 'vitest';
import {
  AA_TEXT_CONTRAST,
  contrastOn,
  contrastRatio,
  readableOn,
  themePalettes,
} from '@/theme/tokens';

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

describe('readableOn', () => {
  it('leaves colors that already pass untouched', () => {
    expect(readableOn('#157A3A', ['#FFFFFF'])).toBe('#157A3A');
  });

  it('darkens a mid-tone hue until it clears AA on a light surface', () => {
    const fixed = readableOn('#FB7185', ['#FFFFFF', '#F8F8FA']);
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    expect(contrastRatio(fixed, '#F8F8FA')).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    // Hue survives the adjustment: it is still a rose, not gray or black.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(fixed.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('lightens a hue until it clears AA on dark surfaces', () => {
    const fixed = readableOn('#3F1D2A', ['#09090B', '#121214']);
    expect(contrastRatio(fixed, '#09090B')).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
  });
});

describe('theme palettes', () => {
  it('keeps every finance text token at WCAG AA on surface, variant, and page background', () => {
    for (const [name, palette] of Object.entries(themePalettes)) {
      const surfaces = [palette.surface, palette.surfaceVariant, palette.background];
      for (const token of ['incomeText', 'expenseText', 'transferText', 'errorText'] as const) {
        for (const surface of surfaces) {
          const ratio = contrastRatio(palette[token], surface);
          expect(
            ratio,
            `${name}.${token} (${palette[token]}) on ${surface} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
        }
      }
    }
  });

  it('keeps the finance fills used by charts and chips unchanged', () => {
    expect(themePalettes.light.expense).toBe('#FB7185');
    expect(themePalettes.light.income).toBe('#157A3A');
    expect(themePalettes.dark.expense).toBe('#FB7185');
    expect(themePalettes.dark.transfer).toBe('#94A3B8');
  });

  it('matches the light-theme fallback declared in index.css', () => {
    expect(themePalettes.light.expenseText).toBe('#B55160');
  });
});
