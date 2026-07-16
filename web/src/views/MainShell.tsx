import { useState, type JSX, useEffect } from 'react';
import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconInsights, IconRecord, IconSettings } from '@/components/Icons';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { AppBrandWordmark } from '@/components/AppBrandWordmark';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';

type Tab = 'record' | 'insights' | 'settings';
type Overlay = null | { type: 'add' | 'edit' | 'categories'; expenseId?: string };

export function MainShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('record');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['record']));
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null);

  const showVerifyBanner = Boolean(user && !user.emailVerified && !verifyDismissed);

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

  const resendVerification = async () => {
    setVerifyBusy(true);
    setVerifyInfo(null);
    try {
      await authService.resendVerificationEmail();
      setVerifyInfo(t('authVerifyEmailSent'));
    } catch {
      setVerifyInfo(t('authErrorGeneric'));
    } finally {
      setVerifyBusy(false);
    }
  };

  const refreshVerification = async () => {
    setVerifyBusy(true);
    setVerifyInfo(null);
    try {
      await authService.refreshUser();
    } catch {
      setVerifyInfo(t('authErrorGeneric'));
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <>
      {/* SINGLE MASTER CONTAINER */}
      <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-8 relative min-h-screen">

        {/* Header — brand and desktop nav */}
        <header className="flex items-center justify-between py-6 border-b border-white/[0.04]">
          <button
            type="button"
            className="app-header__brand"
            onClick={() => selectTab('record')}
            aria-label={t('appName')}
          >
            <AppBrandIcon size={36} className="app-header__logo-mark" />
            <AppBrandWordmark className="app-header__wordmark" />
          </button>

          <nav className="app-header__nav" aria-label={t('appName')}>
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  className={`app-header__nav-item${active ? ' app-header__nav-item--active' : ''}`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.35 : 1.85} aria-hidden />
                  <span className="app-header__nav-label">{label}</span>
                </button>
              );
            })}
          </nav>
        </header>

        {showVerifyBanner ? (
          <div className="verify-banner" role="status" aria-live="polite">
            <p className="verify-banner__text">{t('authVerifyBanner')}</p>
            {verifyInfo ? <p className="verify-banner__info">{verifyInfo}</p> : null}
            <div className="verify-banner__actions">
              <button type="button" className="verify-banner__btn" disabled={verifyBusy} onClick={() => void resendVerification()}>
                {t('authVerifyResend')}
              </button>
              <button type="button" className="verify-banner__btn verify-banner__btn--primary" disabled={verifyBusy} onClick={() => void refreshVerification()}>
                {t('authVerifyRefresh')}
              </button>
              <button type="button" className="verify-banner__dismiss" disabled={verifyBusy} onClick={() => setVerifyDismissed(true)} aria-label={t('authVerifyDismiss')}>
                {t('authVerifyDismiss')}
              </button>
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <main className="app-shell__main">
          {(['record', 'insights', 'settings'] as Tab[]).map((tabId) => {
            const active = tab === tabId;
            if (!visitedTabs.has(tabId) && !active) return null;
            return (
              <div
                key={tabId}
                className={`tab-panel ${active ? 'tab-panel--active tab-panel--animate-in' : 'hidden'}`}
                aria-hidden={!active}
              >
                {tabContent[tabId]}
              </div>
            );
          })}
        </main>
      </div>

      {/* Bottom nav — premium floating pill + elevated add button */}
      <div className="fixed bottom-[calc(1.5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 md:hidden">
        <nav
          className="bottom-nav-pill flex items-center gap-0.5 rounded-full pl-2 pr-1 py-1.5"
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
                className={`bottom-nav-pill__item relative w-11 h-11 flex items-center justify-center rounded-full transition-all duration-200 ${
                  active ? 'bottom-nav-pill__item--active' : ''
                }`}
              >
                <Icon width={20} height={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {active && (
                  <span className="bottom-nav-pill__dot absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" aria-hidden />
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          className="fab-add flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200 active:scale-90 hover:brightness-110 hover:-translate-y-0.5"
          aria-label={t('navAdd')}
          onClick={() => setOverlay({ type: 'add' })}
        >
          <IconAdd width={22} height={22} strokeWidth={2.5} />
        </button>
      </div>

      {/* Desktop FAB — sits on the content column’s right edge, not the viewport */}
      <button
        type="button"
        className="fab-add fab-add--desktop"
        aria-label={t('navAdd')}
        onClick={() => setOverlay({ type: 'add' })}
      >
        <IconAdd width={24} height={24} strokeWidth={2.5} />
      </button>

      {overlay?.type === 'add' || overlay?.type === 'edit' ? (
        <AddTransactionView
          expenseId={overlay.type === 'edit' ? overlay.expenseId : undefined}
          onClose={() => setOverlay(null)}
          onSaved={() => setOverlay(null)}
          onManageCategories={() => setOverlay({ type: 'categories' })}
        />
      ) : null}
      {overlay?.type === 'categories' ? <CategoriesView onClose={() => setOverlay(null)} /> : null}

      <ToastHost />
    </>
  );
}
