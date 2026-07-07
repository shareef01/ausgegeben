/** Design tokens mirrored from Android DesignTokens.kt + Color.kt */

const OBSIDIAN = '#09090B';

function expandHex(hex: string): string {
  const h = hex.replace('#', '');
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
}

function parseRgb(color: string): [number, number, number] | null {
  if (color.startsWith('#')) {
    const full = expandHex(color);
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const match = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(color: string): number {
  const rgb = parseRgb(color);
  if (!rgb) return 0.3;
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** Readable foreground on arbitrary filled surfaces — mirrors Android contrastColorOn(). */
export function contrastColorOn(fill: string): string {
  return relativeLuminance(fill) > 0.55 ? OBSIDIAN : '#FFFFFF';
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Read a CSS custom property from :root (e.g. '--color-expense'). */
export function readCssColor(varName: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 32,
  xl: 48,
  xxl: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 10,
  interactive: 12,
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
  primary: '#FFFFFF',
  onPrimary: '#000000',
  background: '#000000',
  onBackground: '#FAFAFA',
  surface: '#121214', // Flagship Graphite
  onSurface: '#F4F4F5',
  surfaceVariant: '#18181B',
  onSurfaceVariant: '#85858F',
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
  surfaceVariant: '#F8F8FA',
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
  lavender: baseLight({ primary: '#7C3AED', background: '#FCFAFF', onBackground: '#1E1B2E', surface: '#FFFFFF', surfaceVariant: '#F3EEFF', onSurfaceVariant: '#574F68', error: '#E11D48' }),
  soft_light: baseLight({ primary: '#7C5E44', background: '#FAF7F2', onBackground: '#1D1A17', surface: '#FFFCF7', surfaceVariant: '#F0E8DC', onSurfaceVariant: '#5C4F42', error: '#C2410C' }),
};

export function resolveTheme(mode: string, systemDark: boolean): ThemePalette {
  if (mode === 'system') return systemDark ? themePalettes.dark : themePalettes.light;
  return themePalettes[mode] ?? themePalettes.dark;
}

export function resolveThemeModeId(mode: string, systemDark: boolean): string {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

export function applyThemeMode(mode: string, systemDark: boolean): void {
  const themeModeId = resolveThemeModeId(mode, systemDark);
  const signature = `${themeModeId}:${systemDark}`;
  if (typeof document !== 'undefined' && document.documentElement.dataset.themeSignature === signature) {
    return;
  }
  applyTheme(resolveTheme(mode, systemDark), themeModeId);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.themeSignature = signature;
  }
}

export function brandAccent(palette: ThemePalette): string {
  return palette.income;
}

export function financeIncome(palette: ThemePalette): string {
  return palette.income;
}

export function applyTheme(palette: ThemePalette, themeModeId?: string): void {
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
  root.style.setProperty('--color-warning', palette.isDark ? '#FBBF24' : '#D97706');
  root.style.setProperty('--color-accent', palette.primary);
  root.style.setProperty('--color-on-filled', contrastColorOn(palette.primary));
  root.style.setProperty('--color-on-destructive', contrastColorOn(palette.expense));
  root.style.setProperty('--color-focus', palette.focusRing);
  root.style.setProperty('--color-date-divider', palette.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)');
  root.style.setProperty('--color-text-secondary', withAlpha(palette.onSurfaceVariant, palette.isDark ? 0.72 : 0.88));
  root.style.setProperty('--color-nav-inactive', withAlpha(palette.onSurfaceVariant, palette.isDark ? 0.6 : 0.72));

  // Adaptive Glassmorphism
  root.style.setProperty('--glass-bg', palette.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)');
  root.style.setProperty('--glass-border', palette.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--glass-bg-elevated', palette.isDark ? 'rgba(18, 18, 20, 0.92)' : 'rgba(255, 255, 255, 0.85)');

  root.style.setProperty('--surface-border', palette.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)');
  root.style.setProperty('--color-oled-surface', palette.surface);
  root.style.setProperty('--color-oled-surface-elevated', palette.surfaceVariant);
  root.style.setProperty('--hairline-border', palette.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)');
  root.style.setProperty('--hairline-divider', palette.isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)');

  root.style.setProperty('--color-label-muted', withAlpha(palette.onSurfaceVariant, palette.isDark ? 0.72 : 0.88));
  root.style.setProperty('--color-balance-positive', palette.isDark ? palette.income : palette.incomeLight);
  root.style.setProperty('--color-balance-negative', palette.expense);
  root.style.setProperty('--color-stat-value', palette.onBackground);

  root.style.setProperty(
    '--shadow-cta-physical',
    `0 8px 32px color-mix(in srgb, ${palette.income} 40%, transparent)`,
  );

  root.style.setProperty('--gradient-income', `linear-gradient(135deg, ${palette.income} 0%, #059669 100%)`);
  root.style.setProperty('--gradient-expense', `linear-gradient(135deg, ${palette.expense} 0%, #E11D48 100%)`);
  root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${palette.income} 0%, #047857 100%)`);

  root.style.setProperty('--shadow-accent-glow', `0 12px 40px color-mix(in srgb, ${palette.income} 35%, transparent)`);
  root.style.setProperty('--shadow-income-glow', `0 8px 28px color-mix(in srgb, ${palette.income} 32%, transparent)`);
  root.style.setProperty('--shadow-expense-glow', `0 8px 28px color-mix(in srgb, ${palette.expense} 28%, transparent)`);

  // Aurora Ambient Glow
  root.style.setProperty('--aurora-glow', palette.isDark
    ? `radial-gradient(1000px at top right, color-mix(in srgb, ${palette.income} 15%, transparent), transparent)`
    : `radial-gradient(1200px at top right, color-mix(in srgb, ${palette.income} 8%, transparent), transparent)`);

  root.dataset.theme = palette.isDark ? 'dark' : 'light';
  if (themeModeId) {
    root.dataset.themeMode = themeModeId;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.background);
}
