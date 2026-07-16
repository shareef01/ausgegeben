import { useState, type JSX } from 'react';
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
type TxnOverlay = null | { type: 'add' } | { type: 'edit'; expenseId: string };

export function MainShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('record');
  const [txnOverlay, setTxnOverlay] = useState<TxnOverlay>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['record']));
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null);

  const showVerifyBanner = Boolean(user && !user.emailVerified && !verifyDismissed);

  const selectTab = (next: Tab) => {
    setVisitedTabs((prev) => new Set(prev).add(next));
    setTab(next);
  };

  const navItems: { id: Tab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  const tabContent: Record<Tab, JSX.Element | null> = {
    record: (
      <RecordView
        onEdit={(id) => setTxnOverlay({ type: 'edit', expenseId: id })}
        onAdd={() => setTxnOverlay({ type: 'add' })}
      />
    ),
    insights: <InsightsView onAdd={() => setTxnOverlay({ type: 'add' })} />,
    settings: <SettingsView onManageCategories={() => setCategoriesOpen(true)} />,
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
        <header className="app-header flex items-center justify-between py-5 border-b border-white/[0.04]">
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
                  <Icon width={20} height={20} aria-hidden />
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
          className="bottom-nav-pill flex items-center gap-0.5 rounded-full p-1"
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
                className={`bottom-nav-pill__item${active ? ' bottom-nav-pill__item--active' : ''}`}
              >
                <Icon width={20} height={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className="bottom-nav-pill__label">{label}</span>
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          className="fab-add flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 active:scale-90 hover:brightness-110 hover:-translate-y-0.5"
          aria-label={t('navAdd')}
          onClick={() => setTxnOverlay({ type: 'add' })}
        >
          <IconAdd width={22} height={22} strokeWidth={2.5} />
        </button>
      </div>

      {/* Desktop FAB — sits on the content column’s right edge, not the viewport */}
      <button
        type="button"
        className="fab-add fab-add--desktop"
        aria-label={t('navAdd')}
        onClick={() => setTxnOverlay({ type: 'add' })}
      >
        <IconAdd width={24} height={24} strokeWidth={2.5} />
      </button>

      {txnOverlay ? (
        <AddTransactionView
          expenseId={txnOverlay.type === 'edit' ? txnOverlay.expenseId : undefined}
          suspended={categoriesOpen}
          onClose={() => setTxnOverlay(null)}
          onSaved={() => setTxnOverlay(null)}
          onManageCategories={() => setCategoriesOpen(true)}
        />
      ) : null}
      {categoriesOpen ? <CategoriesView onClose={() => setCategoriesOpen(false)} /> : null}

      <ToastHost />
    </>
  );
}
