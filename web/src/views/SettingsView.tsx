import { useState, type ReactNode, type ComponentType, useRef, useCallback } from 'react';
import { SignatureText } from '@/components/ui';
import {
  IconChevronRight,
  IconMoon,
  IconGlobe,
  IconCurrency,
  IconGauge,
  IconLayers,
  IconDownload,
  IconCheck,
  IconSettings,
} from '@/components/Icons';
import type { SVGProps } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation, type Locale, type TranslationKey } from '@/i18n';
import { currencyLabel, formatAmount, SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { ThemeMode } from '@/models/types';
import { themePalettes } from '@/theme/tokens';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import packageJson from '../../package.json';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconTint = 'accent' | 'income' | 'expense' | 'neutral';

const THEME_OPTIONS: { key: ThemeMode; labelKey: TranslationKey }[] = [
  { key: 'system', labelKey: 'themeSystem' },
  { key: 'light', labelKey: 'themeLight' },
  { key: 'dark', labelKey: 'themeDark' },
  { key: 'amoled', labelKey: 'themeAmoled' },
  { key: 'midnight', labelKey: 'themeMidnight' },
  { key: 'ocean', labelKey: 'themeOcean' },
  { key: 'forest', labelKey: 'themeForest' },
  { key: 'sunset', labelKey: 'themeSunset' },
  { key: 'lavender', labelKey: 'themeLavender' },
  { key: 'soft_light', labelKey: 'themeSoftLight' },
];

interface SettingsViewProps {
  onManageCategories: () => void;
}

export function SettingsView({ onManageCategories }: SettingsViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const user = useAuthStore((s) => s.user);
  const setCurrency = usePreferencesStore((s) => s.setCurrency);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const setMonthlyBudget = usePreferencesStore((s) => s.setMonthlyBudget);
  const [showTheme, setShowTheme] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const budgetInputRef = useRef<HTMLInputElement>(null);

  const exportData = async () => {
    const expenses = await expenseRepository.getAllExpenses();
    const categories = await expenseRepository.getAllCategories();
    const csv = exportCsv(expenses, categories);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ausgegeben-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayName = user?.displayName?.trim()
    || user?.email?.split('@')[0]
    || t('settingsCloudAccount');
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <>
      <div className="settings-page">
        <header className="settings-page__header">
          <h1 className="settings-page__title">
            <SignatureText text={t('screenSettings')} />
          </h1>
        </header>

        {user ? (
          <section className="settings-account card card--elevated" aria-label={t('settingsCloudAccount')}>
            <div className="settings-account__avatar" aria-hidden>{initial}</div>
            <div className="settings-account__meta">
              <div className="settings-account__name">{displayName}</div>
              {user.email ? <div className="settings-account__email">{user.email}</div> : null}
              <div className="settings-account__badge">{t('settingsAccountSyncEnabled')}</div>
            </div>
            <button
              type="button"
              className="settings-signout-btn"
              onClick={() => setShowSignOutConfirm(true)}
            >
              {t('settingsSignOut')}
            </button>
          </section>
        ) : null}

        <div className="settings-grid">
          <Section title={t('settingsPreferences')}>
            <SettingsRow icon={IconMoon} iconTint="accent" title={t('settingsTheme')} subtitle={t(THEME_OPTIONS.find((opt) => opt.key === themeMode)?.labelKey ?? 'themeSystem')} onClick={() => setShowTheme(true)} />
            <SettingsRow icon={IconGlobe} iconTint="accent" title={t('settingsLanguage')} subtitle={locale === 'de' ? t('langGerman') : t('langEnglish')} onClick={() => setShowLanguage(true)} />
            <SettingsRow icon={IconCurrency} iconTint="income" title={t('settingsCurrency')} subtitle={currencyLabel(currency)} onClick={() => setShowCurrency(true)} />
            {editBudget ? (
              <div className="settings-budget-edit">
                <input
                  ref={budgetInputRef}
                  className="field__input"
                  type="number"
                  inputMode="decimal"
                  placeholder={t('budgetPlaceholder')}
                  aria-label={t('settingsMonthlyLimit')}
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const n = Number.parseFloat(budgetInput.replace(',', '.'));
                      setMonthlyBudget(Number.isFinite(n) && n > 0 ? n : null);
                      setEditBudget(false);
                    } else if (e.key === 'Escape') {
                      setEditBudget(false);
                    }
                  }}
                  autoFocus
                />
                <div className="settings-budget-edit__actions">
                  <button type="button" className="btn btn-primary flex-1 px-4 py-2.5 rounded-xl font-bold" onClick={() => {
                    const n = Number.parseFloat(budgetInput.replace(',', '.'));
                    setMonthlyBudget(Number.isFinite(n) && n > 0 ? n : null);
                    setEditBudget(false);
                  }}>{t('actionSave')}</button>
                  <button type="button" className="btn btn-secondary flex-1 px-4 py-2.5 rounded-xl border border-surface-border" onClick={() => setEditBudget(false)}>{t('actionCancel')}</button>
                </div>
              </div>
            ) : (
              <SettingsRow
                icon={IconGauge}
                iconTint="neutral"
                title={t('settingsMonthlyLimit')}
                subtitle={monthlyBudget ? formatAmount(monthlyBudget, currency) : t('settingsMonthlyLimitNotSet')}
                onClick={() => {
                  setBudgetInput(monthlyBudget?.toString().replace('.', ',') ?? '');
                  setEditBudget(true);
                }}
              />
            )}
          </Section>

          <Section title={t('settingsData')}>
            <SettingsRow icon={IconLayers} iconTint="accent" title={t('settingsCategories')} subtitle={t('settingsCategoriesSub')} onClick={onManageCategories} />
            <SettingsRow icon={IconDownload} iconTint="neutral" title={t('settingsExport')} subtitle={t('settingsExportSub')} onClick={() => void exportData()} />
          </Section>

          <Section title={t('settingsAbout')}>
            <SettingsRow
              icon={IconSettings}
              iconTint="neutral"
              title={t('settingsVersion')}
              subtitle={t('settingsVersionSubtitle', { version: packageJson.version })}
            />
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title={t('settingsSignOut')}
        message={t('settingsSignOutConfirm')}
        confirmLabel={t('settingsSignOut')}
        cancelLabel={t('actionCancel')}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void authService.signOut();
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {showLanguage ? (
        <Modal title={t('settingsLanguage')} onClose={() => setShowLanguage(false)}>
          <div role="radiogroup" aria-label={t('settingsLanguage')}>
            {(['en', 'de'] as Locale[]).map((code) => (
              <PickerOptionRow
                key={code}
                icon={IconGlobe}
                tint="accent"
                label={code === 'de' ? t('langGerman') : t('langEnglish')}
                selected={locale === code}
                onClick={() => { setLocale(code); setShowLanguage(false); }}
              />
            ))}
          </div>
        </Modal>
      ) : null}

      {showTheme ? (
        <Modal title={t('settingsChooseTheme')} onClose={() => setShowTheme(false)}>
          <div className="theme-picker" role="radiogroup" aria-label={t('settingsChooseTheme')}>
            {THEME_OPTIONS.map((opt) => {
              const selected = themeMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`theme-picker__option${selected ? ' theme-picker__option--selected' : ''}`}
                  onClick={() => {
                    setShowTheme(false);
                    requestAnimationFrame(() => setThemeMode(opt.key));
                  }}
                >
                  <ThemeSwatch mode={opt.key} />
                  <span className="theme-picker__label">{t(opt.labelKey)}</span>
                  {selected ? (
                    <span className="theme-picker__check" aria-hidden>
                      <IconCheck width={18} height={18} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title={t('settingsChooseCurrency')} onClose={() => setShowCurrency(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2" role="radiogroup" aria-label={t('settingsChooseCurrency')}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <PickerOptionRow
                key={c}
                icon={IconCurrency}
                tint="income"
                label={currencyLabel(c)}
                selected={currency === c}
                onClick={() => { setCurrency(c); setShowCurrency(false); }}
              />
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="settings-section__title">{title}</h2>
      <div className="settings-group">{children}</div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  iconTint = 'accent',
  title,
  subtitle,
  subtitleError,
  onClick,
}: {
  icon: IconComponent;
  iconTint?: IconTint;
  title: string;
  subtitle: string;
  subtitleError?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="settings-row__icon-tile" data-tint={iconTint}>
        <Icon width={18} height={18} strokeWidth={2} />
      </span>
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        <div className={`settings-row__sub ${subtitleError ? 'settings-row__sub--error' : ''}`}>{subtitle}</div>
      </div>
      {onClick ? (
        <span className="settings-row__chevron" aria-hidden>
          <IconChevronRight width={20} height={20} strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="settings-row settings-row--static">{content}</div>;
  }

  return (
    <button type="button" className="settings-row settings-row--interactive" onClick={onClick}>
      {content}
    </button>
  );
}

const PICKER_TINT_CLASSES: Record<IconTint, { bg: string; text: string }> = {
  accent: { bg: 'bg-accent/10', text: 'text-accent' },
  income: { bg: 'bg-income/10', text: 'text-income' },
  expense: { bg: 'bg-expense/10', text: 'text-expense' },
  neutral: { bg: 'bg-on-surface/10', text: 'text-on-surface-variant' },
};

function PickerOptionRow({
  icon: Icon,
  tint = 'accent',
  label,
  selected,
  onClick,
}: {
  icon: IconComponent;
  tint?: IconTint;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { bg, text } = PICKER_TINT_CLASSES[tint];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`settings-row w-full flex items-center gap-4 p-4 rounded-xl transition-colors hover:bg-on-surface/5 ${selected ? bg : ''}`}
      onClick={onClick}
    >
      <span className="settings-row__icon-tile" data-tint={tint}>
        <Icon width={20} height={20} />
      </span>
      <span className="flex-1 text-left font-medium">{label}</span>
      {selected ? (
        <span className={text} aria-hidden>
          <IconCheck width={20} height={20} />
        </span>
      ) : null}
    </button>
  );
}

function ThemeSwatch({ mode }: { mode: ThemeMode }) {
  const colors =
    mode === 'system'
      ? [themePalettes.light.background, themePalettes.dark.background, themePalettes.dark.income]
      : (() => {
          const palette = themePalettes[mode] ?? themePalettes.dark;
          return [palette.primary, palette.income, palette.expense];
        })();

  return (
    <span className="theme-swatch" aria-hidden>
      {colors.map((color, i) => (
        <span key={i} className="theme-swatch__dot" style={{ background: color }} />
      ))}
    </span>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(true, sheetRef, handleEscape);
  useBodyScrollLock(true);
  return (
    <div className="overlay overlay--settings" onClick={onClose} role="presentation">
      <div ref={sheetRef} className="sheet sheet--settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1}>
        <div className="sheet--settings__header">
          <h2 id="settings-modal-title" className="sheet--settings__title">{title}</h2>
          <button type="button" className="sheet--settings__close" onClick={onClose}>{t('actionClose')}</button>
        </div>
        <div className="sheet--settings__body">{children}</div>
      </div>
    </div>
  );
}
