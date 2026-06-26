import { useState, type ReactNode } from 'react';
import { ScreenTitle } from '@/components/ui';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation, type Locale } from '@/i18n';
import { currencyLabel, SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { ThemeMode } from '@/models/types';
import { expenseRepository } from '@/repositories/expenseRepository';
import { exportCsv } from '@/utils/analytics';

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
  onSignIn: () => void;
}

export function SettingsView({ onManageCategories, onSignIn }: SettingsViewProps) {
  const { t } = useTranslation();
  const currency = usePreferencesStore((s) => s.currency);
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const authGatewayComplete = usePreferencesStore((s) => s.authGatewayComplete);
  const setCurrency = usePreferencesStore((s) => s.setCurrency);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const setMonthlyBudget = usePreferencesStore((s) => s.setMonthlyBudget);
  const [showTheme, setShowTheme] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);

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

  return (
    <div>
      <ScreenTitle title={t('screenSettings')} subtitle={`Ausgegeben · v1.0`} />

      {!authGatewayComplete ? (
        <div className="offline-banner">
          <div className="offline-banner__stripe" />
          <div className="offline-banner__body">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-on-surface-variant) 14%, transparent)', display: 'grid', placeItems: 'center', fontSize: '1.5rem' }}>☁️̸</div>
              <div>
                <div style={{ fontWeight: 600 }}>{t('settingsOffline')}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{t('settingsOfflineSub')}</div>
              </div>
            </div>
            <button type="button" onClick={onSignIn} style={{ width: '100%', padding: '12px 16px', borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontWeight: 600 }}>
              {t('settingsSignIn')}
            </button>
          </div>
        </div>
      ) : null}

      <Section title={t('settingsAppearance')}>
        <SettingsRow title={t('settingsTheme')} subtitle={THEME_OPTIONS.find((opt) => opt.key === themeMode)?.label ?? themeMode} onClick={() => setShowTheme(true)} />
        <SettingsRow title={t('settingsLanguage')} subtitle={locale === 'de' ? t('langGerman') : t('langEnglish')} onClick={() => setShowLanguage(true)} />
        <SettingsRow title={t('settingsCurrency')} subtitle={currencyLabel(currency)} onClick={() => setShowCurrency(true)} />
      </Section>

      <Section title={t('settingsBudget')}>
        <SettingsRow
          title={t('settingsMonthlyLimit')}
          subtitle={monthlyBudget ? `${monthlyBudget}` : t('settingsMonthlyLimitNotSet')}
          onClick={() => {
            const raw = prompt(t('settingsMonthlyLimit'), monthlyBudget?.toString() ?? '');
            if (raw === null) return;
            const n = Number.parseFloat(raw.replace(',', '.'));
            setMonthlyBudget(Number.isFinite(n) && n > 0 ? n : null);
          }}
        />
      </Section>

      <Section title={t('settingsManagement')}>
        <SettingsRow title={t('settingsCategories')} subtitle={t('settingsCategoriesSub')} onClick={onManageCategories} />
        <SettingsRow title={t('settingsExport')} subtitle={t('settingsExportSub')} onClick={() => void exportData()} />
      </Section>

      {showLanguage ? (
        <Modal title={t('settingsLanguage')} onClose={() => setShowLanguage(false)}>
          {(['en', 'de'] as Locale[]).map((code) => (
            <button key={code} type="button" className="settings-row" onClick={() => { setLocale(code); setShowLanguage(false); }}>
              <span>{code === 'de' ? t('langGerman') : t('langEnglish')}</span>
              {locale === code ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showTheme ? (
        <Modal title={t('settingsChooseTheme')} onClose={() => setShowTheme(false)}>
          {THEME_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" className="settings-row" onClick={() => { setThemeMode(opt.key); setShowTheme(false); }}>
              <span>{opt.label}</span>
              {themeMode === opt.key ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title={t('settingsChooseCurrency')} onClose={() => setShowCurrency(false)}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <button key={c} type="button" className="settings-row" onClick={() => { setCurrency(c); setShowCurrency(false); }}>
              <span>{currencyLabel(c)}</span>
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
  <>
    <div style={{ padding: '12px 16px 6px', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>{title}</div>
    <div className="settings-group">{children}</div>
  </>
  );
}

function SettingsRow({ title, subtitle, onClick }: { title: string; subtitle: string; onClick?: () => void }) {
  return (
    <button type="button" className="settings-row" onClick={onClick}>
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        <div className="settings-row__sub">{subtitle}</div>
      </div>
      <span aria-hidden>›</span>
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
