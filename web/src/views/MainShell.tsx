import { useState } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { SignatureNavLabel } from '@/components/ui';
import { ToastHost } from '@/components/ToastHost';
import { useTranslation } from '@/i18n';
import { AuthView } from '@/views/AuthView';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories' | 'auth'; expenseId?: number };

export function MainShell() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('record');
  const [overlay, setOverlay] = useState<Overlay>(null);

  return (
    <div className="app-shell">
      <main className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}>
        {tab === 'record' ? (
          <RecordView onAdd={() => setOverlay({ type: 'add' })} onEdit={(id) => setOverlay({ type: 'edit', expenseId: id })} />
        ) : null}
        {tab === 'insights' ? <InsightsView /> : null}
        {tab === 'settings' ? (
          <SettingsView
            onManageCategories={() => setOverlay({ type: 'categories' })}
            onSignIn={() => setOverlay({ type: 'auth' })}
          />
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

      {overlay?.type === 'add' || overlay?.type === 'edit' ? (
        <AddTransactionView
          expenseId={overlay.type === 'edit' ? overlay.expenseId : undefined}
          onClose={() => setOverlay(null)}
          onSaved={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.type === 'categories' ? <CategoriesView onClose={() => setOverlay(null)} /> : null}
      {overlay?.type === 'auth' ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--color-background)' }}>
          <AuthView onAuthenticated={() => setOverlay(null)} onDismiss={() => setOverlay(null)} />
        </div>
      ) : null}
    </div>
  );
}
