import { useState } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { SideNavBrand } from '@/components/SideNavBrand';
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
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['record']));
  const syncing = useAuthStore((s) => s.syncing);

  const selectTab = (next: Tab) => {
    setVisitedTabs((prev) => new Set(prev).add(next));
    setTab(next);
  };

  const navItems: { id: Tab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  return (
    <div className="app-shell">
      <nav className="side-nav" aria-label="Main">
        <SideNavBrand appName={t('appName')} />
        <div className="side-nav__menu">
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className={`side-nav__item ${active ? 'side-nav__item--active' : ''}`}
                onClick={() => selectTab(id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="side-nav__indicator" aria-hidden />
                <span className="side-nav__icon-wrap">
                  <Icon className="side-nav__icon" strokeWidth={active ? 2.25 : 2} aria-hidden />
                </span>
                <span className="side-nav__label">{label}</span>
              </button>
            );
          })}
        </div>
        {syncing ? (
          <div className="sync-pill sync-pill--sidebar">
            <IconSync width={14} height={14} className="spin" />
            <span>{t('syncInProgress')}</span>
          </div>
        ) : null}
      </nav>

      <div className="app-shell__body">
        <main className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}>
          {visitedTabs.has('record') ? (
            <div
              className={`tab-panel ${tab === 'record' ? 'tab-panel--active tab-panel--animate-in' : 'tab-panel--hidden'}`}
              aria-hidden={tab !== 'record'}
            >
              <RecordView onEdit={(id) => setOverlay({ type: 'edit', expenseId: id })} />
            </div>
          ) : null}
          {visitedTabs.has('insights') ? (
            <div
              className={`tab-panel ${tab === 'insights' ? 'tab-panel--active tab-panel--animate-in' : 'tab-panel--hidden'}`}
              aria-hidden={tab !== 'insights'}
            >
              <InsightsView />
            </div>
          ) : null}
          {visitedTabs.has('settings') ? (
            <div
              className={`tab-panel ${tab === 'settings' ? 'tab-panel--active tab-panel--animate-in' : 'tab-panel--hidden'}`}
              aria-hidden={tab !== 'settings'}
            >
              <SettingsView onManageCategories={() => setOverlay({ type: 'categories' })} />
            </div>
          ) : null}
        </main>

        <nav className="bottom-bar" aria-label="Main">
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className={`bottom-bar__item ${active ? 'bottom-bar__item--active' : ''}`}
                onClick={() => selectTab(id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="bottom-bar__icon">
                  <Icon width={22} height={22} strokeWidth={active ? 2.25 : 1.75} />
                </span>
                {active ? <span className="bottom-bar__indicator" aria-hidden /> : null}
                <span className="bottom-bar__label">{label}</span>
              </button>
            );
          })}
        </nav>

        {tab === 'record' ? (
          <button type="button" className="fab fab--record" aria-label={t('navAdd')} onClick={() => setOverlay({ type: 'add' })}>
            <span className="fab__icon-wrap">
              <IconAdd width={30} height={30} strokeWidth={2.25} />
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
