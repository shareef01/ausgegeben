import { colorIntToHex } from '@/utils/currency';

/** Muted palette aligned with Android ChartPalette. */
export const CHART_PALETTE_HEX = [
  '#D9A0A0',
  '#8FBFA9',
  '#7EB0E8',
  '#A99AE0',
  '#DDB98A',
  '#7ABFB4',
  '#C9A0B0',
  '#B8A888',
] as const;

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function adjustChannel(value: number, delta: number): number {
  return Math.round(Math.min(255, Math.max(0, value + delta * 255)));
}

function scaleChannel(value: number, factor: number): number {
  return Math.round(Math.min(255, Math.max(0, value * factor)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Tunes a category color so it reads well on charts (matches Android forChartDisplay). */
export function forChartDisplayHex(colorInt: number, fallbackIndex = 0): string {
  const hex = colorIntToHex(colorInt);
  const lum = relativeLuminance(hex);
  if (lum < 0.10) {
    return CHART_PALETTE_HEX[fallbackIndex % CHART_PALETTE_HEX.length];
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (lum < 0.22) {
    return rgbToHex(adjustChannel(r, 0.12), adjustChannel(g, 0.12), adjustChannel(b, 0.12));
  }
  if (lum > 0.88) {
    return rgbToHex(scaleChannel(r, 0.88), scaleChannel(g, 0.88), scaleChannel(b, 0.88));
  }
  return hex;
}

export function chartColorAt(index: number): string {
  return CHART_PALETTE_HEX[index % CHART_PALETTE_HEX.length];
}
