import { useState, type JSX, useEffect } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconInsights, IconRecord, IconSettings } from '@/components/Icons';
import { useTranslation } from '@/i18n';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories'; expenseId?: number };

export function MainShell() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('record');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['record']));

  const selectTab = (next: Tab) => {
    setVisitedTabs((prev) => new Set(prev).add(next));
    setTab(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && overlay) {
        setOverlay(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  const navItems: { id: Tab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  const tabContent: Record<Tab, JSX.Element | null> = {
    record: <RecordView onEdit={(id) => setOverlay({ type: 'edit', expenseId: id })} onAdd={() => setOverlay({ type: 'add' })} />,
    insights: <InsightsView />,
    settings: <SettingsView onManageCategories={() => setOverlay({ type: 'categories' })} />,
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand" onClick={() => selectTab('record')}>
            <div className="app-header__logo-mark" aria-hidden>
              <span className="app-header__logo-letter">A</span>
            </div>
            <span className="app-header__wordmark">
              <span className="app-header__wordmark-accent">{t('appName').charAt(0)}</span>{t('appName').slice(1)}
            </span>
          </div>
          <nav className="app-header__nav-pill" aria-label={t('appName')}>
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`app-header__nav-item ${active ? 'app-header__nav-item--active' : ''}`}
                  onClick={() => selectTab(id)}
                >
                  <Icon width={16} height={16} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="app-shell__body">
        <main className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}>
          {(['record', 'insights', 'settings'] as Tab[]).map((t) => {
            const active = tab === t;
            if (!visitedTabs.has(t) && !active) return null;
            return (
              <div
                key={t}
                className={`tab-panel ${active ? 'tab-panel--active tab-panel--animate-in' : 'tab-panel--hidden'}`}
                aria-hidden={!active}
              >
                {tabContent[t]}
              </div>
            );
          })}
        </main>

        {tab === 'record' ? (
          <button type="button" className="fab fab--record" aria-label={t('navAdd')} onClick={() => setOverlay({ type: 'add' })}>
            <IconAdd width={28} height={28} strokeWidth={2.25} />
          </button>
        ) : null}

        <ToastHost />
      </div>

      <nav className="bottom-bar" aria-label={t('appName')}>
        {navItems.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              className={`bottom-bar__item ${active ? 'bottom-bar__item--active' : ''}`}
              onClick={() => selectTab(id)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
            >
              <Icon width={26} height={26} strokeWidth={active ? 2.35 : 1.75} />
            </button>
          );
        })}
      </nav>

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
