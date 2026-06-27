import { useState, type ReactNode, type ComponentType } from 'react';
import { ScreenTitle } from '@/components/ui';
import {
  IconChevronRight,
  IconMoon,
  IconGlobe,
  IconCurrency,
  IconSync,
  IconLogOut,
  IconGauge,
  IconLayers,
  IconDownload,
  IconCloud,
} from '@/components/Icons';
import type { SVGProps } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { syncService } from '@/services/syncService';
import { useTranslation, type Locale } from '@/i18n';
import { currencyLabel, formatAmount, SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { ThemeMode } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';
import { useToastStore } from '@/services/toastStore';
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
  const lastCloudSyncAt = usePreferencesStore((s) => s.lastCloudSyncAt);
  const user = useAuthStore((s) => s.user);
  const syncing = useAuthStore((s) => s.syncing);
  const syncError = useAuthStore((s) => s.syncError);
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

  const syncLabel = syncing
    ? t('syncInProgress')
    : syncError
      ? syncError
      : lastCloudSyncAt
        ? t('syncLastAt', { time: new Date(lastCloudSyncAt).toLocaleString() })
        : t('syncNever');

  const runSync = async () => {
    const result = await syncService.fullSync(true);
    if (result.ok) {
      useToastStore.getState().show(
        t('syncOk', {
          expenses: String(result.appliedExpenses),
          categories: String(result.appliedCategories),
        }),
      );
    }
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
            {syncError && !syncing ? (
              <div className="sync-error-banner" role="alert">
                {syncError}
              </div>
            ) : null}
            <div className="account-profile-card__header">
              <div className="account-profile-card__avatar" aria-hidden>{initial}</div>
              <div className="account-profile-card__copy">
                <div className="account-profile-card__name">{displayName}</div>
                {user.email ? <div className="account-profile-card__email">{user.email}</div> : null}
                <div className="account-profile-card__badge">{t('settingsAccountSyncEnabled')}</div>
              </div>
            </div>
            <div className="account-profile-card__meta">{syncLabel}</div>
            <div className="account-profile-card__actions">
              <button type="button" className="btn btn-secondary account-profile-card__btn" onClick={() => void runSync()} disabled={syncing}>
                <IconSync width={18} height={18} />
                {t('syncNow')}
              </button>
              <button type="button" className="btn btn-secondary account-profile-card__btn account-profile-card__btn--ghost" onClick={() => setShowSignOutConfirm(true)} disabled={syncing}>
                <IconLogOut width={18} height={18} />
                {t('settingsSignOut')}
              </button>
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
            <button key={code} type="button" className="settings-row settings-row--interactive" onClick={() => { setLocale(code); setShowLanguage(false); }}>
              <span className="settings-row__icon-tile" data-tint="accent"><IconGlobe width={18} height={18} /></span>
              <span style={{ flex: 1 }}>{code === 'de' ? t('langGerman') : t('langEnglish')}</span>
              {locale === code ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showTheme ? (
        <Modal title={t('settingsChooseTheme')} onClose={() => setShowTheme(false)}>
          {THEME_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" className="settings-row settings-row--interactive" onClick={() => { setThemeMode(opt.key); setShowTheme(false); }}>
              <span className="settings-row__icon-tile" data-tint="accent"><IconMoon width={18} height={18} /></span>
              <span style={{ flex: 1 }}>{opt.label}</span>
              {themeMode === opt.key ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title={t('settingsChooseCurrency')} onClose={() => setShowCurrency(false)}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <button key={c} type="button" className="settings-row settings-row--interactive" onClick={() => { setCurrency(c); setShowCurrency(false); }}>
              <span className="settings-row__icon-tile" data-tint="income"><IconCurrency width={18} height={18} /></span>
              <span style={{ flex: 1 }}>{currencyLabel(c)}</span>
              {currency === c ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
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
      <div className="section-title">{title}</div>
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{title}</h2>
          <button type="button" onClick={onClose}>{t('actionClose')}</button>
        </div>
        <div className="settings-group" style={{ margin: 0 }}>{children}</div>
      </div>
    </div>
  );
}
