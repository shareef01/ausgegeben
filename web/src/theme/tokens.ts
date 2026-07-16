/** Design tokens mirrored from Android Color.kt + ThemePalettes.kt + AppTheme.kt */

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

/** Shared semantic finance colors (Android AppColors / light overrides) */
const INCOME_DARK = '#10B981';
const INCOME_LIGHT = '#157A3A';
const EXPENSE = '#FB7185';
const TRANSFER_DARK = '#94A3B8';
const TRANSFER_LIGHT = '#52525B';
const FOCUS_DARK = '#3B82F6';

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

function channelLin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance 0–1 for #RRGGBB */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0;
  const r = channelLin(parseInt(h.slice(0, 2), 16));
  const g = channelLin(parseInt(h.slice(2, 4), 16));
  const b = channelLin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Matches Android contrastColorOn — text on filled chips/buttons */
export function contrastOn(fill: string): string {
  return relativeLuminance(fill) > 0.55 ? '#09090B' : '#FFFFFF';
}

/**
 * Matches Android financeIncomeColor():
 * light → IncomeGreenLight; dark + near-white primary → IncomeGreen; else primary.
 */
function resolveIncome(isDark: boolean, primary: string): string {
  if (!isDark) return INCOME_LIGHT;
  return relativeLuminance(primary) > 0.82 ? INCOME_DARK : primary;
}

const baseDark = (overrides: Partial<ThemePalette> = {}): ThemePalette => {
  const primary = overrides.primary ?? '#FFFFFF';
  const merged: ThemePalette = {
    primary,
    onPrimary: '#000000',
    background: '#000000',
    onBackground: '#FFFFFF',
    surface: '#09090B',
    onSurface: '#FFFFFF',
    surfaceVariant: '#121214',
    onSurfaceVariant: '#A1A1AA',
    outline: '#27272A',
    error: EXPENSE,
    income: INCOME_DARK,
    incomeLight: INCOME_DARK,
    expense: EXPENSE,
    transfer: TRANSFER_DARK,
    focusRing: FOCUS_DARK,
    isDark: true,
    ...overrides,
  };
  // Re-derive finance income after primary is known (Android AppTheme)
  merged.income = resolveIncome(true, merged.primary);
  merged.incomeLight = INCOME_DARK;
  if (!overrides.expense) merged.expense = merged.error;
  if (!overrides.transfer) merged.transfer = TRANSFER_DARK;
  if (!overrides.focusRing) merged.focusRing = FOCUS_DARK;
  return merged;
};

const baseLight = (overrides: Partial<ThemePalette> = {}): ThemePalette => {
  const merged: ThemePalette = {
    primary: '#09090B',
    onPrimary: '#FFFFFF',
    background: '#FFFFFF',
    onBackground: '#09090B',
    surface: '#FFFFFF',
    onSurface: '#09090B',
    surfaceVariant: '#F8F8FA',
    onSurfaceVariant: '#52525B',
    outline: '#E4E4E7',
    error: EXPENSE,
    income: INCOME_LIGHT,
    incomeLight: INCOME_LIGHT,
    expense: EXPENSE,
    transfer: TRANSFER_LIGHT,
    focusRing: '#09090B',
    isDark: false,
    ...overrides,
  };
  merged.income = resolveIncome(false, merged.primary);
  merged.incomeLight = INCOME_LIGHT;
  if (!overrides.expense) merged.expense = merged.error;
  if (!overrides.transfer) merged.transfer = TRANSFER_LIGHT;
  if (!overrides.focusRing) merged.focusRing = merged.primary;
  return merged;
};

/** Exact mirrors of Android ThemePalettes.kt */
export const themePalettes: Record<string, ThemePalette> = {
  dark: baseDark({ primary: '#FFFFFF' }),
  light: baseLight(),
  amoled: baseDark({
    primary: '#FFFFFF',
    background: '#000000',
    surface: '#050505',
    surfaceVariant: '#101010',
    onSurfaceVariant: '#9A9A9A',
    outline: '#242424',
  }),
  midnight: baseDark({
    primary: '#8AB4FF',
    onPrimary: '#000000',
    background: '#070B1A',
    surface: '#0D1326',
    surfaceVariant: '#17203A',
    onSurfaceVariant: '#AAB4CF',
    outline: '#2B3657',
    error: '#FF8A9A',
  }),
  ocean: baseDark({
    primary: '#56D6C9',
    onPrimary: '#000000',
    background: '#061412',
    surface: '#0B1F1D',
    surfaceVariant: '#12332F',
    onSurfaceVariant: '#A0C7C1',
    outline: '#24504B',
    error: '#FF8F80',
  }),
  forest: baseDark({
    primary: '#22C55E',
    onPrimary: '#000000',
    background: '#040F0A',
    surface: '#0B2416',
    surfaceVariant: '#11321F',
    onSurfaceVariant: '#9ABFA4',
    outline: '#1A4D2E',
    error: '#F97373',
  }),
  sunset: baseDark({
    primary: '#FF9F6E',
    onPrimary: '#000000',
    background: '#190B10',
    surface: '#271119',
    surfaceVariant: '#3B1A23',
    onSurfaceVariant: '#E6B2A8',
    outline: '#6D3440',
    error: '#FF6B6B',
  }),
  lavender: baseLight({
    primary: '#7C3AED',
    onPrimary: '#FFFFFF',
    background: '#FCFAFF',
    onBackground: '#1E1B2E',
    surface: '#FFFFFF',
    onSurface: '#1E1B2E',
    surfaceVariant: '#F3EEFF',
    onSurfaceVariant: '#574F68',
    outline: '#E2D8F4',
    error: '#E11D48',
  }),
  soft_light: baseLight({
    primary: '#7C5E44',
    onPrimary: '#FFFFFF',
    background: '#FAF7F2',
    onBackground: '#1D1A17',
    surface: '#FFFCF7',
    onSurface: '#1D1A17',
    surfaceVariant: '#F0E8DC',
    onSurfaceVariant: '#5C4F42',
    outline: '#E0D5C8',
    error: '#C2410C',
  }),
};

export function resolveTheme(mode: string, systemDark: boolean): ThemePalette {
  if (mode === 'system') return systemDark ? themePalettes.dark : themePalettes.light;
  return themePalettes[mode] ?? themePalettes.dark;
}

/** Theme chrome accent = Material primary (Android) */
export function brandAccent(palette: ThemePalette): string {
  return palette.primary;
}

export function financeIncome(palette: ThemePalette): string {
  return palette.income;
}

export function applyTheme(palette: ThemePalette): void {
  const root = document.documentElement;
  const accent = brandAccent(palette);
  const onIncome = contrastOn(palette.income);
  const onTransfer = contrastOn(palette.transfer);
  const onAccent = contrastOn(accent);

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
  root.style.setProperty('--color-income-light', palette.incomeLight);
  root.style.setProperty('--color-expense', palette.expense);
  root.style.setProperty('--color-transfer', palette.transfer);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-on-accent', onAccent);
  root.style.setProperty('--color-focus', palette.focusRing);

  root.style.setProperty('--glass-bg', palette.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)');
  root.style.setProperty('--glass-border', palette.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--glass-bg-elevated', palette.isDark ? 'rgba(9, 9, 11, 0.94)' : 'rgba(255, 255, 255, 0.96)');
  root.style.setProperty('--surface-border', palette.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--hairline-border', palette.isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.09)');
  root.style.setProperty('--hairline-divider', palette.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.07)');

  root.style.setProperty('--color-label-muted', palette.onSurfaceVariant);
  root.style.setProperty('--color-placeholder', palette.onSurfaceVariant);
  root.style.setProperty('--color-balance-positive', palette.income);
  root.style.setProperty('--color-balance-negative', palette.expense);
  root.style.setProperty('--color-stat-value', palette.onBackground);
  root.style.setProperty('--color-on-income', onIncome);
  root.style.setProperty('--color-on-transfer', onTransfer);

  root.style.setProperty('--gradient-income', `linear-gradient(180deg, color-mix(in srgb, ${palette.income} 40%, white) 0%, ${palette.income} 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(180deg, color-mix(in srgb, ${palette.expense} 40%, white) 0%, ${palette.expense} 100%)`);
  root.style.setProperty('--hero-balance-gradient', `linear-gradient(180deg, ${palette.onBackground} 0%, color-mix(in srgb, ${palette.onBackground} 78%, ${palette.onSurfaceVariant}) 100%)`);
  root.style.setProperty('--hero-balance-glow', `color-mix(in srgb, ${palette.onBackground} 12%, transparent)`);

  root.style.setProperty('--shadow-accent-glow', `0 12px 40px color-mix(in srgb, ${accent} 28%, transparent)`);
  root.style.setProperty('--shadow-elevated', palette.isDark
    ? '0 10px 40px rgba(0, 0, 0, 0.45)'
    : '0 8px 28px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)');
  root.style.setProperty('--shadow-nav-pill', palette.isDark
    ? '0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 32px rgba(0, 0, 0, 0.45)'
    : '0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 28px rgba(0, 0, 0, 0.10)');

  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
}
