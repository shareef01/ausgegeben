import type { ThemeMode } from '@/models/types';
import type { TranslationKey } from '@/i18n';
import { themePalettes } from '@/theme/tokens';

export const THEME_MODES: ThemeMode[] = [
  'system',
  'light',
  'dark',
  'amoled',
  'midnight',
  'ocean',
  'forest',
  'sunset',
  'lavender',
  'soft_light',
];

export function themeLabel(mode: ThemeMode, t: (key: TranslationKey) => string): string {
  switch (mode) {
    case 'system': return t('themeSystem');
    case 'light': return t('themeLight');
    case 'dark': return t('themeDark');
    case 'amoled': return t('themeAmoled');
    case 'midnight': return t('themeMidnight');
    case 'ocean': return t('themeOcean');
    case 'forest': return t('themeForest');
    case 'sunset': return t('themeSunset');
    case 'lavender': return t('themeLavender');
    case 'soft_light': return t('themeSoftLight');
    default: return mode;
  }
}

/** Gradient swatch chips for the theme picker — mirrors Android ThemeMode.getPreviewColors(). */
export function themePreviewColors(mode: ThemeMode): string[] {
  if (mode === 'system') {
    return [themePalettes.dark.background, themePalettes.light.background];
  }
  const palette = themePalettes[mode];
  if (!palette) return [themePalettes.dark.background, themePalettes.dark.primary];
  return [palette.background, palette.primary];
}
