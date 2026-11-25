import { colorIntToHex } from '@/utils/currency';

/** Fallback palette when a category has no usable color. */
const CHART_FALLBACK = [
  '#E07A7A', '#5CB88A', '#5B9FE0', '#9B86E8',
  '#E0A85C', '#4DB8A8', '#D47A9A', '#C4A05A',
];

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Category color tuned for chart surfaces: lift muddy pastels on dark UI;
 * keep deeper, less neon strokes on light UI.
 */
export function segmentColor(colorInt: number, fallbackIndex = 0): string {
  const hex = colorIntToHex(colorInt);
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return CHART_FALLBACK[fallbackIndex % CHART_FALLBACK.length];
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = relativeLuminance(r, g, b);
  if (lum < 0.08) return CHART_FALLBACK[fallbackIndex % CHART_FALLBACK.length];

  const { h, s, l } = rgbToHsl(r, g, b);
  const isLight =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  if (isLight) {
    const s2 = Math.min(0.7, Math.max(0.36, s * 1.12));
    const l2 = Math.min(0.5, Math.max(0.3, l < 0.42 ? l + 0.04 : l * 0.86));
    return hslToHex(h, s2, l2);
  }
  // Pastel category swatches → richer chart strokes on OLED/dark surfaces
  const s2 = Math.min(0.78, Math.max(0.42, s * 1.45 + 0.12));
  const l2 = Math.min(0.64, Math.max(0.44, l < 0.45 ? l + 0.12 : l * 0.92 + 0.04));
  return hslToHex(h, s2, l2);
}
