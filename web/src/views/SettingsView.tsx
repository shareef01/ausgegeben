import { useState, type ReactNode, type ComponentType } from 'react';
import { ScreenTitle } from '@/components/ui';
import {
  IconChevronRight,
  IconMoon,
  IconGlobe,
  IconCurrency,
  IconGauge,
  IconLayers,
  IconDownload,
  IconCloud,
  IconCheck,
} from '@/components/Icons';
import type { SVGProps } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation, type Locale } from '@/i18n';
import { currencyLabel, formatAmount, SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { ThemeMode } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';
import packageJson from '../../package.json';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type IconTint = 'accent' | 'income' | 'expense' | 'neutral';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'amoled', label: 'AMOLED' },
  { key: 'midnight', label: 'Midnight' },
  { key: 'ocean', label: 'Ocean' },
  { key: 'forest', label: 'Forest' },
  { key: 'sunset', label: 'Sunset' },
  { key: 'lavender', label: 'Lavender' },
  { key: 'soft_light', label: 'Soft Light' },
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
    <div className="page-content settings-view">
      <ScreenTitle
        title={t('screenSettings')}
        subtitle={t('settingsVersionSubtitle', { version: packageJson.version })}
      />

      {user ? (
        <section className="settings-section">
          <div className="section-title">{t('settingsCloudAccount')}</div>
          <div className="account-profile-card card card--elevated">
            <div className="account-profile-card__header">
              <div className="account-profile-card__avatar" aria-hidden>{initial}</div>
              <div className="account-profile-card__copy">
                <div className="account-profile-card__name">{displayName}</div>
                {user.email ? <div className="account-profile-card__email">{user.email}</div> : null}
                <div className="account-profile-card__badge">{t('settingsAccountSyncEnabled')}</div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="settings-section">
          <div className="account-profile-card account-profile-card--offline card card--elevated">
            <div className="account-profile-card__header">
              <div className="account-profile-card__avatar account-profile-card__avatar--muted" aria-hidden>
                <IconCloud width={22} height={22} />
              </div>
              <div className="account-profile-card__copy">
                <div className="account-profile-card__name">{t('settingsOffline')}</div>
                <div className="account-profile-card__email">{t('settingsOfflineSub')}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <Section title={t('settingsAppearance')}>
        <SettingsRow icon={IconMoon} iconTint="accent" title={t('settingsTheme')} subtitle={THEME_OPTIONS.find((opt) => opt.key === themeMode)?.label ?? themeMode} onClick={() => setShowTheme(true)} />
        <SettingsRow icon={IconGlobe} iconTint="accent" title={t('settingsLanguage')} subtitle={locale === 'de' ? t('langGerman') : t('langEnglish')} onClick={() => setShowLanguage(true)} />
        <SettingsRow icon={IconCurrency} iconTint="income" title={t('settingsCurrency')} subtitle={currencyLabel(currency)} onClick={() => setShowCurrency(true)} />
      </Section>

      <Section title={t('settingsBudget')}>
        <SettingsRow
          icon={IconGauge}
          iconTint="neutral"
          title={t('settingsMonthlyLimit')}
          subtitle={monthlyBudget ? formatAmount(monthlyBudget, currency) : t('settingsMonthlyLimitNotSet')}
          onClick={() => {
            const raw = prompt(t('settingsMonthlyLimit'), monthlyBudget?.toString() ?? '');
            if (raw === null) return;
            const n = Number.parseFloat(raw.replace(',', '.'));
            setMonthlyBudget(Number.isFinite(n) && n > 0 ? n : null);
          }}
        />
      </Section>

      <Section title={t('settingsManagement')}>
        <SettingsRow icon={IconLayers} iconTint="accent" title={t('settingsCategories')} subtitle={t('settingsCategoriesSub')} onClick={onManageCategories} />
        <SettingsRow icon={IconDownload} iconTint="neutral" title={t('settingsExport')} subtitle={t('settingsExportSub')} onClick={() => void exportData()} />
      </Section>

      {user && (
        <div className="settings-logout-wrap">
          <button
            type="button"
            className="btn btn-secondary settings-logout-btn"
            onClick={() => setShowSignOutConfirm(true)}
          >
            {t('settingsSignOut').toLowerCase()}
          </button>
        </div>
      )}

      {showSignOutConfirm ? (
        <Modal title={t('settingsSignOut')} onClose={() => setShowSignOutConfirm(false)}>
          <p className="settings-confirm-copy">{t('settingsSignOutConfirm')}</p>
          <div className="settings-confirm-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowSignOutConfirm(false)}>{t('actionCancel')}</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowSignOutConfirm(false);
                void authService.signOut();
              }}
            >
              {t('settingsSignOut')}
            </button>
          </div>
        </Modal>
      ) : null}

      {showLanguage ? (
        <Modal title={t('settingsLanguage')} onClose={() => setShowLanguage(false)}>
          {(['en', 'de'] as Locale[]).map((code) => (
            <button
              key={code}
              type="button"
              className={`settings-row settings-row--interactive${locale === code ? ' settings-row--selected' : ''}`}
              onClick={() => { setLocale(code); setShowLanguage(false); }}
            >
              <span className="settings-row__icon-tile" data-tint="accent"><IconGlobe width={18} height={18} /></span>
              <span className="settings-row__label" style={{ flex: 1 }}>
                <span className="settings-row__title">{code === 'de' ? t('langGerman') : t('langEnglish')}</span>
              </span>
              {locale === code ? <span className="settings-row__check" aria-hidden><IconCheck width={18} height={18} /></span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showTheme ? (
        <Modal title={t('settingsChooseTheme')} onClose={() => setShowTheme(false)}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`settings-row settings-row--interactive${themeMode === opt.key ? ' settings-row--selected' : ''}`}
              onClick={() => {
                setShowTheme(false);
                requestAnimationFrame(() => setThemeMode(opt.key));
              }}
            >
              <span className="settings-row__icon-tile" data-tint="accent"><IconMoon width={18} height={18} /></span>
              <span className="settings-row__label" style={{ flex: 1 }}>
                <span className="settings-row__title">{opt.label}</span>
              </span>
              {themeMode === opt.key ? <span className="settings-row__check" aria-hidden><IconCheck width={18} height={18} /></span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title={t('settingsChooseCurrency')} onClose={() => setShowCurrency(false)}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`settings-row settings-row--interactive${currency === c ? ' settings-row--selected' : ''}`}
              onClick={() => { setCurrency(c); setShowCurrency(false); }}
            >
              <span className="settings-row__icon-tile" data-tint="income"><IconCurrency width={18} height={18} /></span>
              <span className="settings-row__label" style={{ flex: 1 }}>
                <span className="settings-row__title">{currencyLabel(c)}</span>
              </span>
              {currency === c ? <span className="settings-row__check" aria-hidden><IconCheck width={18} height={18} /></span> : null}
            </button>
          ))}
        </Modal>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="section-title">{title.toLowerCase()}</div>
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
        <div className="settings-row__title">{title.toLowerCase()}</div>
        <div className={`settings-row__sub ${subtitleError ? 'settings-row__sub--error' : ''}`}>{subtitle?.toLowerCase()}</div>
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="overlay overlay--settings" onClick={onClose} role="presentation">
      <div className="sheet sheet--settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet--settings__header">
          <h2 className="sheet--settings__title">{title}</h2>
          <button type="button" className="sheet--settings__close" onClick={onClose}>{t('actionClose')}</button>
        </div>
        <div className="sheet--settings__body">{children}</div>
      </div>
    </div>
  );
}
