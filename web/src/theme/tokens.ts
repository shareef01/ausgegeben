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
  onSurfaceVariant: '#8F8F97',
  outline: 'rgba(255, 255, 255, 0.08)',
  error: '#FB7185', // Flagship Coral
  income: '#10B981', // Flagship Emerald
  incomeLight: '#059669',
  expense: '#FB7185',
  transfer: '#94A3B8',
  focusRing: '#10B981',
  isDark: true,
  ...overrides,
});

const baseLight = (overrides: Partial<ThemePalette> = {}): ThemePalette => ({
  primary: '#09090B',
  onPrimary: '#FFFFFF',
  background: '#FFFFFF', // Pure White Mandate
  onBackground: '#09090B',
  surface: '#FFFFFF',
  onSurface: '#09090B',
  surfaceVariant: '#F1F1F4',
  onSurfaceVariant: '#52525B',
  outline: '#E4E4E7',
  error: '#FB7185',
  income: '#10B981',
  incomeLight: '#059669',
  expense: '#FB7185',
  transfer: '#52525B',
  focusRing: '#10B981',
  isDark: false,
  ...overrides,
});

export const themePalettes: Record<string, ThemePalette> = {
  dark: baseDark(),
  light: baseLight(),
  amoled: baseDark({ primary: '#FFFFFF', background: '#000000', surface: '#050505', surfaceVariant: '#0A0A0A', onSurfaceVariant: '#9A9A9A' }),
  midnight: baseDark({ primary: '#8AB4FF', background: '#070B1A', surface: '#0D1326', surfaceVariant: '#17203A', onSurfaceVariant: '#AAB4CF', error: '#FF8A9A' }),
  ocean: baseDark({ primary: '#56D6C9', background: '#061412', surface: '#0B1F1D', surfaceVariant: '#12332F', onSurfaceVariant: '#A0C7C1', error: '#FF8F80' }),
  forest: baseDark({ primary: '#22C55E', background: '#040F0A', surface: '#0B2416', surfaceVariant: '#11321F', onSurfaceVariant: '#81A68D', error: '#F97373' }),
  sunset: baseDark({ primary: '#FF9F6E', background: '#190B10', surface: '#271119', surfaceVariant: '#3B1A23', onSurfaceVariant: '#E6B2A8', error: '#FF6B6B' }),
  lavender: baseLight({ primary: '#7C3AED', background: '#FCFAFF', surface: '#FFFFFF', surfaceVariant: '#F3EEFF', onSurfaceVariant: '#574F68', error: '#E11D48' }),
  soft_light: baseLight({ primary: '#7C5E44', background: '#FAF7F2', surface: '#FFFCF7', surfaceVariant: '#F0E8DC', onSurfaceVariant: '#5C4F42', error: '#C2410C' }),
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

  root.style.setProperty('--glass-bg', palette.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)');
  root.style.setProperty('--glass-border', palette.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)');
  root.style.setProperty('--glass-bg-elevated', palette.isDark ? 'rgba(18, 18, 20, 0.92)' : 'rgba(255, 255, 255, 0.94)');
  root.style.setProperty('--surface-border', palette.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--hairline-border', palette.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)');
  root.style.setProperty('--hairline-divider', palette.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.07)');

  root.style.setProperty('--color-label-muted', palette.onSurfaceVariant);
  root.style.setProperty('--color-balance-positive', palette.income);
  root.style.setProperty('--color-balance-negative', palette.expense);
  root.style.setProperty('--color-stat-value', palette.onBackground);

  root.style.setProperty('--gradient-income', `linear-gradient(180deg, color-mix(in srgb, ${palette.income} 40%, white) 0%, ${palette.income} 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(180deg, color-mix(in srgb, ${palette.expense} 40%, white) 0%, ${palette.expense} 100%)`);

  root.style.setProperty('--shadow-accent-glow', `0 12px 40px color-mix(in srgb, ${palette.primary} 25%, transparent)`);

  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
}
