import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { RecordView } from '@/views/RecordView';
import { InsightsView } from '@/views/InsightsView';
import { SettingsView } from '@/views/SettingsView';
import { AddTransactionView } from '@/views/AddTransactionView';
import { CategoriesView } from '@/views/CategoriesView';
import { FabShortcutsDialog } from '@/components/FabShortcutsDialog';
import { AddTransactionButton } from '@/components/AddTransactionButton';
import { TabSwipeSurface } from '@/components/TabSwipeSurface';
import { AppBrandHeader } from '@/components/AppBrandHeader';
import { ToastHost } from '@/components/ToastHost';
import { IconAdd, IconCloudOff, IconInsights, IconRecord, IconSettings, IconSync } from '@/components/Icons';
import { useAuthStore } from '@/services/authStore';
import { syncService } from '@/services/syncService';
import { useTranslation } from '@/i18n';
import { hapticLight, hapticMedium, hapticSuccess } from '@/utils/haptics';
import { resetSheetScrollLock } from '@/utils/sheetScrollLock';
import { readShellRoute, type ShellOverlay, type ShellTab } from '@/utils/shellRouting';
import { APP_INTENT_OPEN_ADD, consumeOpenAddQueryParam, OPEN_ADD_INTENT_EVENT } from '@/shared/appIntents';

type Tab = ShellTab;
type Overlay = ShellOverlay;

type RouteNavMode = 'init' | 'pop';

const TABS: Tab[] = ['record', 'insights', 'settings'];

function resetMainScroll(): void {
  document.getElementById('main-content')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function ShellTabPanel({
  tabId,
  currentTab,
  visited,
  children,
}: {
  tabId: Tab;
  currentTab: Tab;
  visited: boolean;
  children: ReactNode;
}) {
  if (!visited) return null;
  const active = currentTab === tabId;
  return (
    <div
      id={`tabpanel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`tab-${tabId}`}
      className={`tab-panel ${active ? 'tab-panel--active' : 'tab-panel--hidden'}`}
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      {children}
    </div>
  );
}

export function MainShell({ isOffline = false, onRequestSignIn }: { isOffline?: boolean; onRequestSignIn?: () => void }) {
  const { t } = useTranslation();
  const initialRoute = readShellRoute();
  const routeNavRef = useRef<RouteNavMode>('init');
  const [tab, setTab] = useState<Tab>(initialRoute.tab);
  const [overlay, setOverlay] = useState<Overlay>(initialRoute.overlay);
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([initialRoute.tab]));
  const [fabShortcutsOpen, setFabShortcutsOpen] = useState(false);
  const syncing = useAuthStore((s) => s.syncing);
  const syncError = useAuthStore((s) => s.syncError);
  const user = useAuthStore((s) => s.user);

  const applyRoute = useCallback((nextTab: Tab, nextOverlay: Overlay) => {
    setVisitedTabs((prev) => new Set(prev).add(nextTab));
    setTab(nextTab);
    setOverlay(nextOverlay);
  }, []);

  const openOverlay = useCallback((next: Exclude<Overlay, null>) => {
    const overlayTab = next.type === 'categories' ? 'settings' : tab;
    applyRoute(overlayTab, next);
  }, [applyRoute, tab]);

  const closeOverlay = useCallback(() => {
    applyRoute(tab, null);
  }, [applyRoute, tab]);

  useEffect(() => {
    resetSheetScrollLock();
    if (window.location.pathname === '/' && !window.location.hash) {
      window.history.replaceState(null, '', '/record');
    }

    const openAddFromIntent = () => applyRoute('record', { type: 'add' });

    if (consumeOpenAddQueryParam()) {
      openAddFromIntent();
    }

    const onOpenAddIntent = () => openAddFromIntent();
    window.addEventListener(OPEN_ADD_INTENT_EVENT, onOpenAddIntent);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === APP_INTENT_OPEN_ADD) {
        openAddFromIntent();
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      window.removeEventListener(OPEN_ADD_INTENT_EVENT, onOpenAddIntent);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [applyRoute]);

  useEffect(() => {
    const path = `/${tab}`;
    if (routeNavRef.current === 'pop') {
      routeNavRef.current = 'init';
      return;
    }
    routeNavRef.current = 'init';
    if (window.location.pathname === path && !window.location.hash) return;
    window.history.replaceState(null, '', path);
  }, [tab]);

  useEffect(() => {
    const onPopState = () => {
      routeNavRef.current = 'pop';
      const route = readShellRoute();
      applyRoute(route.tab, null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRoute]);

  const selectTab = (next: Tab) => {
    if (next === tab && !overlay) return;

    if (next !== tab) {
      hapticLight();
      resetMainScroll();
    }

    routeNavRef.current = 'init';
    applyRoute(next, null);
  };

  const navItems: { id: Tab; label: string; Icon: typeof IconRecord }[] = [
    { id: 'record', label: t('navRecord'), Icon: IconRecord },
    { id: 'insights', label: t('navInsights'), Icon: IconInsights },
    { id: 'settings', label: t('navSettings'), Icon: IconSettings },
  ];

  const tabIndex = TABS.indexOf(tab);
  const swipeToPrevious = () => {
    if (tabIndex > 0) selectTab(TABS[tabIndex - 1]);
  };
  const swipeToNext = () => {
    if (tabIndex < TABS.length - 1) selectTab(TABS[tabIndex + 1]);
  };

  const openAddShortcuts = useCallback(() => {
    hapticSuccess();
    setFabShortcutsOpen(true);
  }, []);

  const openAdd = useCallback(() => {
    hapticMedium();
    openOverlay({ type: 'add' });
  }, [openOverlay]);

  const handleNavKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (tabIndex < TABS.length - 1) selectTab(TABS[tabIndex + 1]);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (tabIndex > 0) selectTab(TABS[tabIndex - 1]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectTab(TABS[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectTab(TABS[TABS.length - 1]);
    }
  };

  return (
    <div className={`app-shell app-shell--${tab}`}>
      <a href="#main-content" className="skip-link">
        {t('a11ySkipToContent')}
      </a>

      <header className="app-shell__header">
        <AppBrandHeader appName={t('appName')} />
        <div className="app-shell__header-actions">
          {tab === 'record' || tab === 'insights' ? (
            <AddTransactionButton
              className={`btn btn-primary shell-header-add-btn shell-header-add-btn--${tab}`}
              onAdd={openAdd}
              onLongPress={openAddShortcuts}
              aria-label={t('addTransaction')}
            >
              <IconAdd width={18} height={18} aria-hidden />
              {t('addTransaction')}
            </AddTransactionButton>
          ) : null}
          {syncing ? (
            <div className="sync-pill sync-pill--header" role="status" aria-live="polite">
              <IconSync width={14} height={14} className="spin" aria-hidden />
              <span>{t('syncInProgress')}</span>
            </div>
          ) : null}
        </div>
      </header>

      {isOffline ? (
        <div className="offline-banner offline-banner--shell insights-glass-island" role="alert">
          <span className="offline-banner__stripe" aria-hidden />
          <div className="offline-banner__body">{t('offlineNotice')}</div>
        </div>
      ) : null}

      <div className="app-shell__body">
        <div className="app-shell__scroll">
          <TabSwipeSurface
            canSwipeToPrevious={tabIndex > 0}
            canSwipeToNext={tabIndex < TABS.length - 1}
            onSwipeToPrevious={swipeToPrevious}
            onSwipeToNext={swipeToNext}
          >
            <main
              id="main-content"
              className={`app-main ${tab === 'record' ? 'app-main--fab' : ''}`}
              aria-busy={syncing || undefined}
            >
            <ShellTabPanel
              tabId="record"
              currentTab={tab}
              visited={visitedTabs.has('record')}
            >
              <RecordView
                onEdit={(id) => openOverlay({ type: 'edit', expenseId: id })}
                onAdd={openAdd}
                onAddLongPress={openAddShortcuts}
              />
            </ShellTabPanel>

            <ShellTabPanel
              tabId="insights"
              currentTab={tab}
              visited={visitedTabs.has('insights')}
            >
              <InsightsView onAdd={openAdd} onAddLongPress={openAddShortcuts} />
            </ShellTabPanel>

            <ShellTabPanel
              tabId="settings"
              currentTab={tab}
              visited={visitedTabs.has('settings')}
            >
              <SettingsView
                onManageCategories={() => openOverlay({ type: 'categories' })}
                onRequestSignIn={onRequestSignIn}
              />
            </ShellTabPanel>
          </main>
        </TabSwipeSurface>
        </div>

        <footer className="app-shell__footer">
        <div className="app-shell__footer-rail">
        {syncing ? (
          <div className="sync-pill sync-pill--mobile" role="status" aria-live="polite">
            <IconSync width={14} height={14} className="spin" aria-hidden />
            <span>{t('syncInProgress')}</span>
          </div>
        ) : null}

        {user && syncError && !syncing && tab !== 'settings' ? (
          <div className="sync-error-toast insights-glass-island" role="alert">
            <span className="sync-error-toast__icon" aria-hidden>
              <IconCloudOff width={16} height={16} />
            </span>
            <div className="sync-error-toast__copy">
              <span className="sync-error-toast__title">{t('settingsSyncFailed')}</span>
              <span className="sync-error-toast__message">{syncError}</span>
            </div>
            <div className="sync-error-toast__actions">
              <button
                type="button"
                className="btn btn-secondary sync-error-toast__retry"
                onClick={() => void syncService.fullSync(true)}
              >
                {t('recordErrorRetry')}
              </button>
              <button
                type="button"
                className="sync-error-toast__dismiss"
                onClick={() => useAuthStore.getState().setSyncError(null)}
                aria-label={t('actionClose')}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <nav className="bottom-bar" aria-label={t('navMain')} role="tablist" onKeyDown={handleNavKeyDown}>
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`tabpanel-${id}`}
                className={`bottom-bar__item ${active ? 'bottom-bar__item--active' : ''}`}
                onClick={() => selectTab(id)}
                tabIndex={active ? 0 : -1}
              >
                <span className="bottom-bar__pill" aria-hidden>
                  <span className="bottom-bar__icon">
                    <Icon width={active ? 26 : 24} height={active ? 26 : 24} strokeWidth={active ? 2.25 : 1.85} />
                  </span>
                </span>
                <span className="bottom-bar__label sr-only">{label}</span>
              </button>
            );
          })}
        </nav>
        </div>

        <ToastHost />
        </footer>

        <AddTransactionButton
          className={`fab fab--record fab--mobile-only ${tab === 'record' ? 'fab--visible' : 'fab--hidden'}`}
          onAdd={openAdd}
          onLongPress={openAddShortcuts}
          aria-label={t('navAdd')}
          aria-hidden={tab !== 'record'}
          inert={tab !== 'record' ? true : undefined}
          tabIndex={tab === 'record' ? 0 : -1}
        >
          <span className="fab__icon-wrap">
            <IconAdd width={30} height={30} strokeWidth={2.25} />
          </span>
        </AddTransactionButton>
      </div>

      {overlay?.type === 'add' || overlay?.type === 'edit' ? (
        <AddTransactionView
          key={overlay.type === 'edit' ? `edit-${overlay.expenseId}` : overlay.openCamera ? 'add-camera' : 'add'}
          expenseId={overlay.type === 'edit' ? overlay.expenseId : undefined}
          openCameraOnMount={overlay.type === 'add' ? overlay.openCamera : undefined}
          onClose={closeOverlay}
          onSaved={closeOverlay}
        />
      ) : null}
      {fabShortcutsOpen ? (
        <FabShortcutsDialog
          onClose={() => setFabShortcutsOpen(false)}
          onScanReceipt={() => {
            setFabShortcutsOpen(false);
            openOverlay({ type: 'add', openCamera: true });
          }}
          onNewTransaction={() => {
            setFabShortcutsOpen(false);
            openOverlay({ type: 'add' });
          }}
        />
      ) : null}
      {overlay?.type === 'categories' ? <CategoriesView onClose={closeOverlay} /> : null}
    </div>
  );
}
