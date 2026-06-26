import { useState, type ReactNode } from 'react';
import { ScreenTitle } from '@/components/ui';
import { usePreferencesStore } from '@/services/preferencesStore';
import { strings } from '@/i18n/en';
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
  const currency = usePreferencesStore((s) => s.currency);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const monthlyBudget = usePreferencesStore((s) => s.monthlyBudget);
  const authGatewayComplete = usePreferencesStore((s) => s.authGatewayComplete);
  const setCurrency = usePreferencesStore((s) => s.setCurrency);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const setMonthlyBudget = usePreferencesStore((s) => s.setMonthlyBudget);
  const [showTheme, setShowTheme] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);

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
      <ScreenTitle title={strings.screenSettings} subtitle={`Ausgegeben · v1.0`} />

      {!authGatewayComplete ? (
        <div className="offline-banner">
          <div className="offline-banner__stripe" />
          <div className="offline-banner__body">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-on-surface-variant) 14%, transparent)', display: 'grid', placeItems: 'center', fontSize: '1.5rem' }}>☁️̸</div>
              <div>
                <div style={{ fontWeight: 600 }}>{strings.settingsOffline}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{strings.settingsOfflineSub}</div>
              </div>
            </div>
            <button type="button" onClick={onSignIn} style={{ width: '100%', padding: '12px 16px', borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontWeight: 600 }}>
              {strings.settingsSignIn}
            </button>
          </div>
        </div>
      ) : null}

      <Section title="Appearance">
        <SettingsRow title={strings.settingsTheme} subtitle={THEME_OPTIONS.find((t) => t.key === themeMode)?.label ?? themeMode} onClick={() => setShowTheme(true)} />
        <SettingsRow title={strings.settingsCurrency} subtitle={currencyLabel(currency)} onClick={() => setShowCurrency(true)} />
      </Section>

      <Section title="Budget">
        <SettingsRow
          title="Monthly spending limit"
          subtitle={monthlyBudget ? `${monthlyBudget}` : 'Not set'}
          onClick={() => {
            const raw = prompt('Monthly limit amount', monthlyBudget?.toString() ?? '');
            if (raw === null) return;
            const n = Number.parseFloat(raw.replace(',', '.'));
            setMonthlyBudget(Number.isFinite(n) && n > 0 ? n : null);
          }}
        />
      </Section>

      <Section title="Management">
        <SettingsRow title={strings.settingsCategories} subtitle="Add or remove categories" onClick={onManageCategories} />
        <SettingsRow title={strings.settingsExport} subtitle="Download spreadsheet" onClick={() => void exportData()} />
      </Section>

      {showTheme ? (
        <Modal title="Choose theme" onClose={() => setShowTheme(false)}>
          {THEME_OPTIONS.map((t) => (
            <button key={t.key} type="button" className="settings-row" onClick={() => { setThemeMode(t.key); setShowTheme(false); }}>
              <span>{t.label}</span>
              {themeMode === t.key ? <span style={{ color: 'var(--color-income)' }}>✓</span> : null}
            </button>
          ))}
        </Modal>
      ) : null}

      {showCurrency ? (
        <Modal title="Choose currency" onClose={() => setShowCurrency(false)}>
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
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{title}</h2>
          <button type="button" onClick={onClose}>{strings.actionClose}</button>
        </div>
        <div className="settings-group" style={{ margin: 0 }}>{children}</div>
      </div>
    </div>
  );
}
