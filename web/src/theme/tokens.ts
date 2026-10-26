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
  /** WCAG-AA-safe variants of the finance hues, for text/icons on surfaces. */
  incomeText: string;
  expenseText: string;
  transferText: string;
  errorText: string;
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

/** WCAG contrast ratio between two #RRGGBB colors */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ink on filled chips/buttons — pick dark or white by actual contrast,
 * not a luminance gate (mid pinks like #FB7185 fail with white).
 */
export function contrastOn(fill: string): string {
  const dark = '#09090B';
  const light = '#FFFFFF';
  return contrastRatio(dark, fill) >= contrastRatio(light, fill) ? dark : light;
}

/** WCAG 2.2 AA minimum for normal-size body text. */
export const AA_TEXT_CONTRAST = 4.5;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Linear sRGB mix: t=0 returns `from`, t=1 returns `to`. */
export function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * The semantic finance hues (#FB7185 expense, #10B981 income) are tuned as fills
 * and chart accents. Used directly as *text* on light surfaces they miss WCAG AA
 * (rose-on-white is ~2.7:1), which made every expense amount and destructive
 * action hard to read. This walks the hue toward black (on light surfaces) or
 * white (on dark surfaces) in small steps until it clears AA against every
 * background it can land on, so the shipped palette keeps its identity without
 * failing contrast. Fills keep using the untouched base token.
 */
export function readableOn(color: string, backgrounds: string[], target = AA_TEXT_CONTRAST): string {
  const worst = (candidate: string) =>
    Math.min(...backgrounds.map((bg) => contrastRatio(candidate, bg)));
  if (worst(color) >= target) return color;
  const lighter = backgrounds.every((bg) => relativeLuminance(bg) < 0.5);
  const toward = lighter ? '#FFFFFF' : '#000000';
  for (let step = 1; step <= 50; step += 1) {
    const candidate = mixHex(color, toward, step / 50);
    if (worst(candidate) >= target) return candidate;
  }
  return toward;
}

/**
 * Matches Android financeIncomeColor():
 * light → IncomeGreenLight; dark + near-white primary → IncomeGreen; else primary.
 */
function resolveIncome(isDark: boolean, primary: string): string {
  if (!isDark) return INCOME_LIGHT;
  return relativeLuminance(primary) > 0.82 ? INCOME_DARK : primary;
}

/**
 * Fill in the AA-safe text variants once every surface color is known. Cards sit
 * on `surface`, page text on `background`, and some chips on `surfaceVariant`, so
 * all three have to pass for a color to be safe for text anywhere in the app.
 */
function applyReadableTextTokens(palette: ThemePalette): void {
  const surfaces = [palette.surface, palette.surfaceVariant, palette.background];
  palette.incomeText = readableOn(palette.income, surfaces);
  palette.expenseText = readableOn(palette.expense, surfaces);
  palette.transferText = readableOn(palette.transfer, surfaces);
  palette.errorText = readableOn(palette.error, surfaces);
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
    onSurfaceVariant: '#B0B0B8',
    outline: '#27272A',
    error: EXPENSE,
    income: INCOME_DARK,
    incomeLight: INCOME_DARK,
    expense: EXPENSE,
    transfer: TRANSFER_DARK,
    incomeText: INCOME_DARK,
    expenseText: EXPENSE,
    transferText: TRANSFER_DARK,
    errorText: EXPENSE,
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
  applyReadableTextTokens(merged);
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
    onSurfaceVariant: '#404044',
    outline: '#D4D4D8',
    error: EXPENSE,
    income: INCOME_LIGHT,
    incomeLight: INCOME_LIGHT,
    expense: EXPENSE,
    transfer: TRANSFER_LIGHT,
    incomeText: INCOME_LIGHT,
    expenseText: EXPENSE,
    transferText: TRANSFER_LIGHT,
    errorText: EXPENSE,
    focusRing: '#09090B',
    isDark: false,
    ...overrides,
  };
  merged.income = resolveIncome(false, merged.primary);
  merged.incomeLight = INCOME_LIGHT;
  if (!overrides.expense) merged.expense = merged.error;
  if (!overrides.transfer) merged.transfer = TRANSFER_LIGHT;
  if (!overrides.focusRing) merged.focusRing = merged.primary;
  applyReadableTextTokens(merged);
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

/** Last chosen theme mode — applied before React mounts so light UI doesn’t FOUC dark. */
export const THEME_STORAGE_KEY = 'ausgegeben-theme-mode';

const VALID_STORED_THEMES = new Set([
  'system',
  ...Object.keys(themePalettes),
]);

export function readStoredThemeMode(): string {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v && VALID_STORED_THEMES.has(v)) return v;
  } catch {
    // Ignore quota / private-mode failures
  }
  return 'system';
}

export function writeStoredThemeMode(mode: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function resolvedThemeName(mode: string, systemDark: boolean): string {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** Call once from main.tsx before createRoot. */
export function bootstrapTheme(): void {
  const mode = readStoredThemeMode();
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(resolveTheme(mode, systemDark));
  document.documentElement.dataset.themeName = resolvedThemeName(mode, systemDark);
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
  const onExpense = contrastOn(palette.expense);
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
  // AA-safe siblings of the finance fills — use these for text and icons.
  root.style.setProperty('--color-income-text', palette.incomeText);
  root.style.setProperty('--color-expense-text', palette.expenseText);
  root.style.setProperty('--color-transfer-text', palette.transferText);
  root.style.setProperty('--color-error-text', palette.errorText);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-on-accent', onAccent);
  root.style.setProperty('--color-focus', palette.focusRing);

  root.style.setProperty('--color-label-muted', palette.onSurfaceVariant);
  root.style.setProperty('--color-placeholder', palette.onSurfaceVariant);
  root.style.setProperty('--color-balance-positive', palette.incomeText);
  root.style.setProperty('--color-balance-negative', palette.expenseText);
  root.style.setProperty('--color-stat-value', palette.onBackground);
  root.style.setProperty('--color-on-income', onIncome);
  root.style.setProperty('--color-on-expense', onExpense);
  root.style.setProperty('--color-on-transfer', onTransfer);

  if (palette.isDark) {
    root.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.05)');
    root.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.1)');
    root.style.setProperty('--glass-bg-elevated', 'rgba(9, 9, 11, 0.85)');
    root.style.setProperty('--surface-border', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--hairline-border', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--hairline-divider', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--overlay-scrim', 'rgba(0, 0, 0, 0.8)');
    root.style.setProperty('--shadow-elevated', '0 12px 48px rgba(0, 0, 0, 0.6)');
    root.style.setProperty('--shadow-nav-pill', '0 0 0 1px rgba(255, 255, 255, 0.06), 0 12px 32px rgba(0, 0, 0, 0.55)');
  } else {
    // Solid fills — translucent black wash left light UIs looking half-themed
    root.style.setProperty('--glass-bg', 'color-mix(in srgb, ' + palette.surface + ' 85%, transparent)');
    root.style.setProperty('--glass-border', 'rgba(0, 0, 0, 0.08)');
    root.style.setProperty('--glass-bg-elevated', 'color-mix(in srgb, ' + palette.surface + ' 95%, transparent)');
    root.style.setProperty('--surface-border', 'rgba(0, 0, 0, 0.08)');
    root.style.setProperty('--hairline-border', 'rgba(0, 0, 0, 0.08)');
    root.style.setProperty('--hairline-divider', 'rgba(0, 0, 0, 0.06)');
    root.style.setProperty('--overlay-scrim', 'rgba(15, 15, 20, 0.45)');
    root.style.setProperty(
      '--shadow-elevated',
      '0 12px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.03)',
    );
    root.style.setProperty(
      '--shadow-nav-pill',
      '0 0 0 1px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.08)',
    );
  }

  root.style.setProperty('--gradient-income', `linear-gradient(180deg, color-mix(in srgb, ${palette.income} 40%, white) 0%, ${palette.income} 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(180deg, color-mix(in srgb, ${palette.expense} 40%, white) 0%, ${palette.expense} 100%)`);
  root.style.setProperty('--hero-balance-gradient', `linear-gradient(180deg, ${palette.onBackground} 0%, color-mix(in srgb, ${palette.onBackground} 78%, ${palette.onSurfaceVariant}) 100%)`);
  root.style.setProperty('--hero-balance-glow', `color-mix(in srgb, ${palette.onBackground} 12%, transparent)`);

  root.style.setProperty('--shadow-accent-glow', `0 12px 40px color-mix(in srgb, ${accent} 28%, transparent)`);

  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  // Paint html/#root/body — cold-start CSS can leave #root black when OS is dark
  // even after the user picks a light theme.
  root.style.backgroundColor = palette.background;
  root.style.colorScheme = palette.isDark ? 'dark' : 'light';
  if (document.body) document.body.style.backgroundColor = palette.background;
  const appRoot = document.getElementById('root');
  if (appRoot) appRoot.style.backgroundColor = palette.background;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', palette.background);
  });
}
