import { useState } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { SignatureNavLabel, SignatureText } from '@/components/ui';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconInsights, IconRecord, IconSettings, IconSync } from '@/components/Icons';
import { useAuthStore } from '@/services/authStore';
import { useTranslation } from '@/i18n';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories'; expenseId?: number };

export function MainShell() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('record');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const syncing = useAuthStore((s) => s.syncing);

  const navItems: { id: Tab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  return (
    <div className="app-shell">
      <nav className="side-nav" aria-label="Main">
        <div className="side-nav__brand">
          <AppBrandIcon size={32} className="side-nav__brand-icon" />
          <SignatureText text={t('appName')} className="signature-text--brand" />
        </div>
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`side-nav__item ${tab === id ? 'side-nav__item--active' : ''}`}
            onClick={() => setTab(id)}
          >
            <span className="side-nav__icon-wrap"><Icon width={20} height={20} /></span>
            <SignatureNavLabel label={label} />
          </button>
        ))}
        {syncing ? (
          <div className="sync-pill sync-pill--sidebar">
            <IconSync width={14} height={14} className="spin" />
            <span>{t('syncInProgress')}</span>
          </div>
        ) : null}
      </nav>

      <div className="app-shell__body">
        <main className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}>
          <div key={tab} className="tab-panel tab-panel--animate-in">
            {tab === 'record' ? (
              <RecordView onAdd={() => setOverlay({ type: 'add' })} onEdit={(id) => setOverlay({ type: 'edit', expenseId: id })} />
            ) : null}
            {tab === 'insights' ? <InsightsView /> : null}
            {tab === 'settings' ? (
              <SettingsView onManageCategories={() => setOverlay({ type: 'categories' })} />
            ) : null}
          </div>
        </main>

        <nav className="bottom-bar" aria-label="Main">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`bottom-bar__item ${tab === id ? 'bottom-bar__item--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span className="bottom-bar__icon"><Icon width={22} height={22} /></span>
              <SignatureNavLabel label={label} />
            </button>
          ))}
        </nav>

        {tab === 'record' ? (
          <button type="button" className="fab fab--mobile-only" aria-label={t('navAdd')} onClick={() => setOverlay({ type: 'add' })}>
            <span className="fab__icon-wrap">
              <IconAdd width={28} height={28} strokeWidth={2.5} />
            </span>
          </button>
        ) : null}

        <ToastHost />
      </div>

      {overlay?.type === 'add' || overlay?.type === 'edit' ? (
        <AddTransactionView
          expenseId={overlay.type === 'edit' ? overlay.expenseId : undefined}
          onClose={() => setOverlay(null)}
          onSaved={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.type === 'categories' ? <CategoriesView onClose={() => setOverlay(null)} /> : null}
    </div>
  );
}
