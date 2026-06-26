import { useState } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { SignatureNavLabel } from '@/components/ui';
import { ToastHost } from '@/components/ToastHost';
import { useTranslation } from '@/i18n';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories'; expenseId?: number };

export function MainShell() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('record');
  const [overlay, setOverlay] = useState<Overlay>(null);

  return (
    <div className="app-shell">
      <nav className="side-nav" aria-label="Main">
        <div className="side-nav__brand">
          <span className="screen-title__accent">A</span>usgegeben
        </div>
        <button type="button" className={`side-nav__item ${tab === 'record' ? 'side-nav__item--active' : ''}`} onClick={() => setTab('record')}>
          <span className="side-nav__icon">📋</span>
          <SignatureNavLabel label={t('navRecord')} />
        </button>
        <button type="button" className={`side-nav__item ${tab === 'insights' ? 'side-nav__item--active' : ''}`} onClick={() => setTab('insights')}>
          <span className="side-nav__icon">📊</span>
          <SignatureNavLabel label={t('navInsights')} />
        </button>
        <button type="button" className={`side-nav__item ${tab === 'settings' ? 'side-nav__item--active' : ''}`} onClick={() => setTab('settings')}>
          <span className="side-nav__icon">⚙️</span>
          <SignatureNavLabel label={t('navSettings')} />
        </button>
      </nav>

      <div className="app-shell__body">
        <main className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}>
          {tab === 'record' ? (
            <RecordView onAdd={() => setOverlay({ type: 'add' })} onEdit={(id) => setOverlay({ type: 'edit', expenseId: id })} />
          ) : null}
          {tab === 'insights' ? <InsightsView /> : null}
          {tab === 'settings' ? (
            <SettingsView onManageCategories={() => setOverlay({ type: 'categories' })} />
          ) : null}
        </main>

        <nav className="bottom-bar" aria-label="Main">
          <button type="button" className={`bottom-bar__item ${tab === 'record' ? 'bottom-bar__item--active' : ''}`} onClick={() => setTab('record')}>
            <span>📋</span>
            <SignatureNavLabel label={t('navRecord')} />
          </button>
          <button type="button" className={`bottom-bar__item ${tab === 'insights' ? 'bottom-bar__item--active' : ''}`} onClick={() => setTab('insights')}>
            <span>📊</span>
            <SignatureNavLabel label={t('navInsights')} />
          </button>
          <button type="button" className={`bottom-bar__item ${tab === 'settings' ? 'bottom-bar__item--active' : ''}`} onClick={() => setTab('settings')}>
            <span>⚙️</span>
            <SignatureNavLabel label={t('navSettings')} />
          </button>
        </nav>

        {tab === 'record' ? (
          <button type="button" className="fab" aria-label={t('navAdd')} onClick={() => setOverlay({ type: 'add' })}>+</button>
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
