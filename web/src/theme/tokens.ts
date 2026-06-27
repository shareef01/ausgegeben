/** Design tokens mirrored from Android DesignTokens.kt + Color.kt */

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  card: 12,
  xl: 16,
  pill: 999,
} as const;

export interface ThemePalette {
  primary: string;
  onPrimary: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  error: string;
  income: string;
  incomeLight: string;
  expense: string;
  transfer: string;
  focusRing: string;
  isDark: boolean;
}

const baseDark = (overrides: Partial<ThemePalette> = {}): ThemePalette => ({
  primary: '#FAFAFA',
  onPrimary: '#000000',
  background: '#000000',
  onBackground: '#FAFAFA',
  surface: '#121212',
  onSurface: '#F4F4F5',
  surfaceVariant: '#18181B',
  onSurfaceVariant: '#A1A1AA',
  outline: 'rgba(255, 255, 255, 0.08)',
  error: '#FF453A',
  income: '#30D158',
  incomeLight: '#248A3D',
  expense: '#FF6B35',
  transfer: '#94A3B8',
  focusRing: '#0A84FF',
  isDark: true,
  ...overrides,
});

const baseLight = (overrides: Partial<ThemePalette> = {}): ThemePalette => ({
  primary: '#09090B',
  onPrimary: '#FFFFFF',
  background: '#FAFAFA',
  onBackground: '#09090B',
  surface: '#FFFFFF',
  onSurface: '#09090B',
  surfaceVariant: '#F4F4F5',
  onSurfaceVariant: '#52525B',
  outline: '#E4E4E7',
  error: '#E85D5D',
  income: '#22C55E',
  incomeLight: '#157A3A',
  expense: '#E85D5D',
  transfer: '#52525B',
  focusRing: '#3B82F6',
  isDark: false,
  ...overrides,
});

export const themePalettes: Record<string, ThemePalette> = {
  dark: baseDark(),
  light: baseLight(),
  amoled: baseDark({ primary: '#FFFFFF', background: '#000000', surface: '#050505', surfaceVariant: '#101010', onSurfaceVariant: '#9A9A9A' }),
  midnight: baseDark({ primary: '#8AB4FF', background: '#070B1A', surface: '#0D1326', surfaceVariant: '#17203A', onSurfaceVariant: '#AAB4CF', error: '#FF8A9A' }),
  ocean: baseDark({ primary: '#56D6C9', background: '#061412', surface: '#0B1F1D', surfaceVariant: '#12332F', onSurfaceVariant: '#A0C7C1', error: '#FF8F80' }),
  forest: baseDark({ primary: '#86EFAC', background: '#06130B', surface: '#0C2013', surfaceVariant: '#16351F', onSurfaceVariant: '#A7CFB0', error: '#F97373' }),
  sunset: baseDark({ primary: '#FF9F6E', background: '#190B10', surface: '#271119', surfaceVariant: '#3B1A23', onSurfaceVariant: '#E6B2A8', error: '#FF6B6B' }),
  lavender: baseLight({ primary: '#7C3AED', background: '#FCFAFF', surface: '#FFFFFF', surfaceVariant: '#F3EEFF', onSurfaceVariant: '#574F68', error: '#E11D48' }),
  soft_light: baseLight({ primary: '#7C5E44', background: '#FAF7F2', surface: '#FFFCF7', surfaceVariant: '#F0E8DC', onSurfaceVariant: '#5C4F42', error: '#C2410C' }),
};

export function resolveTheme(mode: string, systemDark: boolean): ThemePalette {
  if (mode === 'system') return systemDark ? themePalettes.dark : themePalettes.light;
  return themePalettes[mode] ?? themePalettes.dark;
}

export function brandAccent(palette: ThemePalette): string {
  const lum = luminance(palette.primary);
  if (lum > 0.9 || lum < 0.1) return palette.isDark ? palette.income : palette.incomeLight;
  return palette.primary;
}

export function financeIncome(palette: ThemePalette): string {
  return palette.isDark ? palette.income : palette.incomeLight;
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyTheme(palette: ThemePalette): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', palette.primary);
  root.style.setProperty('--color-on-primary', palette.onPrimary);
  root.style.setProperty('--color-background', palette.background);
  root.style.setProperty('--color-on-background', palette.onBackground);
  root.style.setProperty('--color-surface', palette.surface);
  root.style.setProperty('--color-on-surface', palette.onSurface);
  root.style.setProperty('--color-surface-variant', palette.surfaceVariant);
  root.style.setProperty('--color-on-surface-variant', palette.onSurfaceVariant);
  root.style.setProperty('--color-outline', palette.outline);
  root.style.setProperty('--color-error', palette.error);
  root.style.setProperty('--color-income', financeIncome(palette));
  root.style.setProperty('--color-expense', palette.expense);
  root.style.setProperty('--color-transfer', palette.transfer);
  root.style.setProperty('--color-accent', brandAccent(palette));
  root.style.setProperty('--color-focus', palette.focusRing);
  root.style.setProperty('--color-date-divider', palette.isDark ? '#94A3B8' : '#64748B');
  root.style.setProperty('--glass-bg', palette.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.025)');
  root.style.setProperty('--glass-border', palette.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.07)');
  root.style.setProperty('--glass-bg-elevated', palette.isDark ? 'rgba(18, 18, 18, 0.88)' : 'rgba(255, 255, 255, 0.72)');
  root.style.setProperty('--surface-border', palette.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)');
  root.style.setProperty('--gradient-income', `linear-gradient(135deg, ${financeIncome(palette)} 0%, #34C759 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(135deg, ${palette.expense} 0%, #FF453A 100%)`);
  root.style.setProperty('--gradient-accent', palette.isDark
    ? 'linear-gradient(135deg, #34d399 0%, #157A3A 45%, #0d9488 100%)'
    : 'linear-gradient(135deg, #157A3A 0%, #22c55e 100%)');
  root.style.setProperty('--shadow-accent-glow', `0 8px 32px color-mix(in srgb, ${brandAccent(palette)} 42%, transparent)`);
  root.style.setProperty('--shadow-income-glow', `0 8px 28px color-mix(in srgb, ${financeIncome(palette)} 32%, transparent)`);
  root.style.setProperty('--shadow-expense-glow', `0 8px 28px color-mix(in srgb, ${palette.expense} 28%, transparent)`);
  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
}
