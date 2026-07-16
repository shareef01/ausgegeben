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
  card: 16,
  xl: 24,
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
  surface: '#121214', // Flagship Graphite
  onSurface: '#F4F4F5',
  surfaceVariant: '#18181B',
  // ~7:1 on black — secondary labels stay WCAG AA
  onSurfaceVariant: '#A1A1AA',
  outline: 'rgba(255, 255, 255, 0.12)',
  error: '#FB7185', // Flagship Coral
  income: '#34D399', // brighter for dark surfaces
  incomeLight: '#10B981',
  expense: '#FB7185',
  transfer: '#A1A1AA',
  focusRing: '#34D399',
  isDark: true,
  ...overrides,
});

const baseLight = (overrides: Partial<ThemePalette> = {}): ThemePalette => ({
  primary: '#09090B',
  onPrimary: '#FFFFFF',
  background: '#FFFFFF',
  onBackground: '#09090B',
  surface: '#FFFFFF',
  onSurface: '#09090B',
  surfaceVariant: '#F4F4F5',
  // ~7:1 on white
  onSurfaceVariant: '#52525B',
  outline: '#D4D4D8',
  // Darker semantic colors so amounts/labels pass AA on white (~4.7:1+)
  error: '#E11D48',
  income: '#047857',
  incomeLight: '#059669',
  expense: '#E11D48',
  transfer: '#3F3F46',
  focusRing: '#059669',
  isDark: false,
  ...overrides,
});

export const themePalettes: Record<string, ThemePalette> = {
  dark: baseDark(),
  light: baseLight(),
  amoled: baseDark({ primary: '#FFFFFF', background: '#000000', surface: '#050505', surfaceVariant: '#0A0A0A', onSurfaceVariant: '#A1A1AA' }),
  midnight: baseDark({ primary: '#8AB4FF', background: '#070B1A', surface: '#0D1326', surfaceVariant: '#17203A', onSurfaceVariant: '#B4BFD9', error: '#FF8A9A', income: '#6EE7B7', focusRing: '#8AB4FF' }),
  ocean: baseDark({ primary: '#56D6C9', background: '#061412', surface: '#0B1F1D', surfaceVariant: '#12332F', onSurfaceVariant: '#A8D0CA', error: '#FF8F80', income: '#5EEAD4', focusRing: '#56D6C9' }),
  forest: baseDark({ primary: '#4ADE80', background: '#040F0A', surface: '#0B2416', surfaceVariant: '#11321F', onSurfaceVariant: '#9AB8A4', error: '#F97373', income: '#4ADE80', focusRing: '#4ADE80' }),
  sunset: baseDark({ primary: '#FF9F6E', background: '#190B10', surface: '#271119', surfaceVariant: '#3B1A23', onSurfaceVariant: '#E8C0B8', error: '#FF6B6B', income: '#6EE7B7', focusRing: '#FF9F6E' }),
  lavender: baseLight({ primary: '#6D28D9', background: '#FCFAFF', surface: '#FFFFFF', surfaceVariant: '#F3EEFF', onSurfaceVariant: '#4C4460', error: '#BE123C', income: '#047857', expense: '#BE123C', focusRing: '#7C3AED' }),
  soft_light: baseLight({ primary: '#6B4F38', background: '#FAF7F2', surface: '#FFFCF7', surfaceVariant: '#F0E8DC', onSurfaceVariant: '#5C4F42', error: '#C2410C', income: '#3F6B4A', expense: '#C2410C', focusRing: '#7C5E44' }),
};

export function resolveTheme(mode: string, systemDark: boolean): ThemePalette {
  if (mode === 'system') return systemDark ? themePalettes.dark : themePalettes.light;
  return themePalettes[mode] ?? themePalettes.dark;
}

export function brandAccent(palette: ThemePalette): string {
  return palette.income;
}

export function financeIncome(palette: ThemePalette): string {
  return palette.income;
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
  root.style.setProperty('--color-income', palette.income);
  root.style.setProperty('--color-expense', palette.expense);
  root.style.setProperty('--color-transfer', palette.transfer);
  root.style.setProperty('--color-accent', palette.income);
  root.style.setProperty('--color-focus', palette.focusRing);

  root.style.setProperty('--glass-bg', palette.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)');
  root.style.setProperty('--glass-border', palette.isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--glass-bg-elevated', palette.isDark ? 'rgba(18, 18, 20, 0.94)' : 'rgba(255, 255, 255, 0.96)');
  root.style.setProperty('--surface-border', palette.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--hairline-border', palette.isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.09)');
  root.style.setProperty('--hairline-divider', palette.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)');

  root.style.setProperty('--color-label-muted', palette.onSurfaceVariant);
  root.style.setProperty('--color-placeholder', palette.onSurfaceVariant);
  root.style.setProperty('--color-balance-positive', palette.income);
  root.style.setProperty('--color-balance-negative', palette.expense);
  root.style.setProperty('--color-stat-value', palette.onBackground);
  // Text on income fills (FAB, primary buttons, active pills)
  root.style.setProperty('--color-on-income', palette.isDark ? '#052E1C' : '#FFFFFF');
  root.style.setProperty('--color-on-transfer', palette.isDark ? '#09090B' : '#FFFFFF');

  root.style.setProperty('--gradient-income', `linear-gradient(180deg, color-mix(in srgb, ${palette.income} 40%, white) 0%, ${palette.income} 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(180deg, color-mix(in srgb, ${palette.expense} 40%, white) 0%, ${palette.expense} 100%)`);
  root.style.setProperty('--hero-balance-gradient', `linear-gradient(180deg, ${palette.onBackground} 0%, color-mix(in srgb, ${palette.onBackground} 78%, ${palette.onSurfaceVariant}) 100%)`);
  root.style.setProperty('--hero-balance-glow', `color-mix(in srgb, ${palette.onBackground} 12%, transparent)`);

  root.style.setProperty('--shadow-accent-glow', `0 12px 40px color-mix(in srgb, ${palette.income} 28%, transparent)`);
  root.style.setProperty('--shadow-elevated', palette.isDark
    ? '0 10px 40px rgba(0, 0, 0, 0.45)'
    : '0 8px 28px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)');
  root.style.setProperty('--shadow-nav-pill', palette.isDark
    ? '0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 32px rgba(0, 0, 0, 0.45)'
    : '0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 28px rgba(0, 0, 0, 0.10)');

  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
}
