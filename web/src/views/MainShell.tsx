import { useState, useEffect, lazy, Suspense, type JSX } from 'react';
import { useCssProps } from '@/utils/cssVars';
import { RecordView } from '@/views/RecordView';
// Lazy-loaded so their code (and the charts Insights pulls in) is split into
// on-demand chunks instead of the initial bundle — Record is the first view.
const InsightsView = lazy(() => import('@/views/InsightsView').then((m) => ({ default: m.InsightsView })));
const SettingsView = lazy(() => import('@/views/SettingsView').then((m) => ({ default: m.SettingsView })));
const AddTransactionView = lazy(() => import('@/views/AddTransactionView').then((m) => ({ default: m.AddTransactionView })));
const CategoriesView = lazy(() => import('@/views/CategoriesView').then((m) => ({ default: m.CategoriesView })));
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconInsights, IconRecord, IconSettings } from '@/components/Icons';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRecurringSync } from '@/services/recurringStore';
import {
  APP_TABS,
  readTabFromSearch,
  shouldPushTab,
  tabUrlFor,
  type AppTab,
} from '@/utils/tabHistory';
import { preferencesSync } from '@/services/preferencesSync';

type TxnOverlay = null | { type: 'add' } | { type: 'edit'; expenseId: string };

export function MainShell() {
  useRecurringSync();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isOnline = useOnlineStatus();
  // UX-4: the URL is the source of truth for the active tab, so Back/Forward, reload and a
  // copied link all agree with what is on screen. `?tab=` rather than a fragment because
  // `#app-main` belongs to the skip link.
  const [tab, setTab] = useState<AppTab>(() =>
    typeof window === 'undefined' ? 'record' : readTabFromSearch(window.location.search),
  );
  const [txnOverlay, setTxnOverlay] = useState<TxnOverlay>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  useEffect(() => {
    setTxnOverlay(null);
    setCategoriesOpen(false);
  }, [user?.uid]);
  const [visitedTabs, setVisitedTabs] = useState<Set<AppTab>>(() => new Set([tab]));
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<string | null>(null);

  const showVerifyBanner = Boolean(isOnline && user && !user.emailVerified && !verifyDismissed);

  /** Keeps a view mounted once visited, so switching back does not refetch or reset it. */
  const rememberTab = (next: AppTab) => {
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  const selectTab = (next: AppTab) => {
    rememberTab(next);
    if (!shouldPushTab(next, tab)) return;
    window.history.pushState(window.history.state, '', tabUrlFor(window.location.search, window.location.hash, next));
    setTab(next);
  };

  // Back/Forward. The popstate handler re-reads the URL rather than trusting a stored index, so
  // a manual URL edit or a restored session behaves the same way.
  useEffect(() => {
    const onPopState = () => {
      const next = readTabFromSearch(window.location.search);
      rememberTab(next);
      setTab(next);
      // Focus is moved for history navigation only: a mouse/keyboard user who clicked a nav item
      // keeps their place in the nav, but someone who pressed Back has no idea where focus went,
      // so it lands on the region that just changed.
      const main = document.getElementById('app-main');
      if (main) main.focus({ preventScroll: false });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Normalise the URL once on mount (`replaceState`, so no phantom history entry): the tab is
  // then always named, which is what makes a reload, a copied link and a Back-after-reload agree
  // with what is on screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === tab) return;
    window.history.replaceState(
      window.history.state,
      '',
      tabUrlFor(window.location.search, window.location.hash, tab),
    );
    // Mount-only: later changes go through selectTab / popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navItems: { id: AppTab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  const tabContent: Record<AppTab, JSX.Element | null> = {
    record: (
      <RecordView
        onEdit={(id) => setTxnOverlay({ type: 'edit', expenseId: id })}
        onAdd={() => setTxnOverlay({ type: 'add' })}
      />
    ),
    insights: <InsightsView onAdd={() => setTxnOverlay({ type: 'add' })} onManageBudgets={() => selectTab('settings')} />,
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
      <a href="#app-main" className="skip-link">
        {t('actionSkipToContent')}
      </a>

      {/* SINGLE MASTER CONTAINER */}
      <div className="app-shell">
      <div className="app-frame">

        {/* Header — mark + icon nav (desktop) */}
        <header className="app-header">
          <button
            type="button"
            className="app-header__brand"
            onClick={() => selectTab('record')}
            aria-label={t('appName')}
            title={t('appName')}
          >
            <AppBrandIcon size={28} className="app-header__logo-mark" />
          </button>

          {isDesktop ? (
            <DesktopHeaderNav tab={tab} navItems={navItems} onSelect={selectTab} label={t('navMain')} />
          ) : null}
        </header>

        {!isOnline ? (
          <div className="offline-banner" role="status" aria-live="polite">
            <p className="offline-banner__text">{t('settingsSyncErrorNetwork')}</p>
            <button
              type="button"
              className="offline-banner__retry"
              onClick={() => preferencesSync.retry()}
            >
              {t('settingsSyncRetry')}
            </button>
          </div>
        ) : null}

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
        <main id="app-main" className="app-shell__main" tabIndex={-1}>
          {APP_TABS.map((tabId) => {
            const active = tab === tabId;
            if (!visitedTabs.has(tabId) && !active) return null;
            return (
              <div
                key={tabId}
                className={`tab-panel ${active ? 'tab-panel--active tab-panel--animate-in' : 'hidden'}`}
                aria-hidden={!active}
                {...(!active ? { inert: true } : {})}
              >
                <Suspense
                  fallback={
                    <div className="tab-panel__loading" role="status" aria-busy="true" aria-live="polite">
                      <span className="sr-only">{t('loading')}</span>
                    </div>
                  }
                >
                  {tabContent[tabId]}
                </Suspense>
              </div>
            );
          })}
        </main>
      </div>

      {/* Bottom nav — mobile only (not mounted on desktop → not in tab order) */}
      {!isDesktop ? (
        <div className="mobile-dock">
          <nav
            className="bottom-nav-pill flex items-center gap-0.5 rounded-full p-1"
            aria-label={t('navMain')}
          >
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  aria-current={active ? 'page' : undefined}
                  title={label}
                  className={`bottom-nav-pill__item${active ? ' bottom-nav-pill__item--active' : ''}`}
                >
                  <Icon width={22} height={22} strokeWidth={active ? 2.25 : 1.85} aria-hidden />
                  {/* DW-1: the mobile dock had no hover state to reveal a tooltip, so its icons
                      were unlabelled for sighted users. The label is the accessible name now (no
                      separate aria-label), which keeps the screen-reader and visual names
                      identical. */}
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
            <IconAdd width={22} height={22} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="fab-add fab-add--desktop"
          aria-label={t('navAdd')}
          onClick={() => setTxnOverlay({ type: 'add' })}
        >
          <IconAdd width={24} height={24} strokeWidth={2.5} aria-hidden />
        </button>
      )}

      {txnOverlay ? (
        <Suspense
          fallback={
            <div className="overlay-loading" role="status" aria-busy="true" aria-live="polite">
              <span className="sr-only">{t('loading')}</span>
            </div>
          }
        >
          <AddTransactionView
            expenseId={txnOverlay.type === 'edit' ? txnOverlay.expenseId : undefined}
            suspended={categoriesOpen}
            onClose={() => setTxnOverlay(null)}
            onSaved={() => setTxnOverlay(null)}
            onManageCategories={() => setCategoriesOpen(true)}
          />
        </Suspense>
      ) : null}
      {categoriesOpen ? (
        <Suspense
          fallback={
            <div className="overlay-loading" role="status" aria-busy="true" aria-live="polite">
              <span className="sr-only">{t('loading')}</span>
            </div>
          }
        >
          <CategoriesView onClose={() => setCategoriesOpen(false)} />
        </Suspense>
      ) : null}

      <ToastHost />
      </div>
    </>
  );
}

function DesktopHeaderNav({
  tab,
  navItems,
  onSelect,
  label,
}: {
  tab: AppTab;
  navItems: { id: AppTab; label: string; Icon: typeof IconRecord }[];
  onSelect: (tab: AppTab) => void;
  label: string;
}) {
  const navRef = useCssProps<HTMLElement>({
    '--nav-i': Math.max(0, navItems.findIndex((item) => item.id === tab)),
  });

  return (
    <nav ref={navRef} className="app-header__nav" aria-label={label}>
      <span className="app-header__nav-thumb" aria-hidden />
      {navItems.map(({ id, label: itemLabel, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={itemLabel}
            title={itemLabel}
            className={`app-header__nav-item${active ? ' app-header__nav-item--active' : ''}`}
          >
            <Icon width={20} height={20} className="app-header__nav-icon" aria-hidden />
            <span className="app-header__nav-label" aria-hidden>{itemLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
