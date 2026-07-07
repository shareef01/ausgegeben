import { contrastColorOn } from '@/theme/tokens';
import { colorIntToHex } from '@/utils/currency';

export const CATEGORY_COLOR_PALETTE_INTS: number[] = [
  0xffd9a0a0, 0xff8fbfa9, 0xff7eb0e8, 0xffa99ae0, 0xffddb98a, 0xff7abfb4,
  0xffc9a0b0, 0xffb8a888, 0xffb8a0a0, 0xff9aafc4, 0xff9b93c8, 0xff8ab5ac,
  0xffc4b090, 0xff9b9ba8, 0xff6e6e78, 0xff48484e,
];

export const CATEGORY_ICON_KEYS: string[] = [
  'category', 'shopping_cart', 'shopping_bag', 'restaurant', 'cafe', 'car', 'gas', 'home',
  'bolt', 'wifi', 'subscriptions', 'smoking', 'health', 'fitness', 'education', 'work',
  'flight', 'hotel', 'wallet', 'savings', 'credit_card', 'trending_up', 'undo', 'swap_horiz',
  'gift', 'entertainment', 'pets', 'child', 'phone', 'laptop', 'emoji_events',
];

export function normalizeArgbInt(value: number): number {
  return (value & 0xff000000) === 0 ? value | 0xff000000 : value;
}

export function nearestPaletteColorInt(argb: number): number {
  const target = hexToRgb(colorIntToHex(normalizeArgbInt(argb)));
  let best = CATEGORY_COLOR_PALETTE_INTS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const palette of CATEGORY_COLOR_PALETTE_INTS) {
    const rgb = hexToRgb(colorIntToHex(palette));
    const dist = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = palette;
    }
  }
  return best;
}

export function defaultIconKeyForName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('groc')) return 'shopping_cart';
  if (n.includes('shop')) return 'shopping_bag';
  if (n.includes('food') || n.includes('rest')) return 'restaurant';
  if (n.includes('car') || n.includes('transport')) return 'car';
  if (n.includes('home') || n.includes('rent')) return 'home';
  if (n.includes('util') || n.includes('elec')) return 'bolt';
  if (n.includes('sub')) return 'subscriptions';
  if (n.includes('salary') || n.includes('pay')) return 'credit_card';
  if (n.includes('cash')) return 'wallet';
  if (n.includes('transfer')) return 'swap_horiz';
  if (n.includes('refund')) return 'undo';
  if (n.includes('dividend') || n.includes('income')) return 'trending_up';
  if (n.includes('award')) return 'emoji_events';
  if (n.includes('health') || n.includes('med')) return 'health';
  if (n.includes('travel') || n.includes('flight')) return 'flight';
  return 'category';
}

export function iconTintOnCategoryFill(colorInt: number): string {
  return contrastColorOn(colorIntToHex(normalizeArgbInt(colorInt)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
