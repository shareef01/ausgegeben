import { useState, type JSX, useEffect } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconInsights, IconRecord, IconSettings } from '@/components/Icons';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { useTranslation } from '@/i18n';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories'; expenseId?: string };

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
    <>
      {/* SINGLE MASTER CONTAINER */}
      <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-8 relative min-h-screen">

        {/* Header — brand and desktop nav */}
        <header className="flex items-center justify-between py-6 border-b border-white/[0.04]">
          <button type="button" className="flex items-center gap-3 shrink-0 bg-transparent border-none p-0 cursor-pointer" onClick={() => selectTab('record')} aria-label={t('navRecord')}>
            <AppBrandIcon size={36} className="app-header__logo-mark" />
            <span className="app-header__wordmark text-xl font-extrabold tracking-tight text-on-background leading-none flex items-center">
              <span className="text-accent leading-none">{t('appName').charAt(0)}</span>{t('appName').slice(1)}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1 bg-surface border border-white/10 rounded-full p-1.5" aria-label={t('appName')}>
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 ${
                    active
                      ? 'bg-income text-black font-bold shadow-md'
                      : 'text-zinc-500 hover:text-white font-medium'
                  }`}
                >
                  <Icon width={18} height={18} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-xs uppercase tracking-wider">{label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* Main content */}
        <main className="pt-2 sm:pt-4 pb-40">
          {(['record', 'insights', 'settings'] as Tab[]).map((t) => {
            const active = tab === t;
            if (!visitedTabs.has(t) && !active) return null;
            return (
              <div
                key={t}
                className={`tab-panel ${active ? 'tab-panel--active tab-panel--animate-in' : 'hidden'}`}
                aria-hidden={!active}
              >
                {tabContent[t]}
              </div>
            );
          })}
        </main>
      </div>

      {/* Bottom nav — premium floating pill + elevated add button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 md:hidden">
        <nav
          className="flex items-center gap-0.5 bg-[#0C0C0E]/95 backdrop-blur-2xl border border-white/[0.06] rounded-full pl-2 pr-1 py-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_32px_rgba(0,0,0,0.45)]"
          aria-label={t('appName')}
        >
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 ${
                  active
                    ? 'text-[#10B981] bg-[#10B981]/10 ring-1 ring-[#10B981]/20 shadow-[0_0_16px_rgba(16,185,129,0.12)]'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon width={20} height={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {active && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#10B981] shadow-[0_0_4px_rgba(16,185,129,0.6)]" aria-hidden />
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          className="flex items-center justify-center w-11 h-11 rounded-full bg-income text-black shadow-[0_0_0_2px_rgba(16,185,129,0.15),0_4px_24px_rgba(16,185,129,0.5)] transition-all duration-200 active:scale-90 hover:brightness-110 hover:-translate-y-0.5"
          aria-label={t('navAdd')}
          onClick={() => setOverlay({ type: 'add' })}
        >
          <IconAdd width={22} height={22} strokeWidth={2.5} />
        </button>
      </div>

      {/* Desktop FAB */}
      <button
        type="button"
        className="hidden md:flex fixed bottom-8 right-8 z-50 w-14 h-14 bg-income hover:brightness-110 text-black rounded-full shadow-lg items-center justify-center transition-all duration-500"
        aria-label={t('navAdd')}
        onClick={() => setOverlay({ type: 'add' })}
      >
        <IconAdd width={28} height={28} strokeWidth={2.5} />
      </button>

      {overlay?.type === 'add' || overlay?.type === 'edit' ? (
        <AddTransactionView
          expenseId={overlay.type === 'edit' ? overlay.expenseId : undefined}
          onClose={() => setOverlay(null)}
          onSaved={() => setOverlay(null)}
        />
      ) : null}
      {overlay?.type === 'categories' ? <CategoriesView onClose={() => setOverlay(null)} /> : null}

      <ToastHost />
    </>
  );
}
