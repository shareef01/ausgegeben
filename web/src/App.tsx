import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { syncService } from '@/services/syncService';
import { reminderService } from '@/services/reminderService';
import { applyThemeMode } from '@/theme/tokens';
import { ensureSeeded } from '@/services/database';
import { preloadCategories } from '@/services/categoryCache';
import { isAuthEverReady } from '@/services/authService';
import { OnboardingView } from '@/views/OnboardingView';
import { AuthView } from '@/views/AuthView';
import { MainShell } from '@/views/MainShell';
import { LoadingGlassSpinner } from '@/components/ui';
import { AppViewport } from '@/components/AppViewport';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { useTranslation } from '@/i18n';

let appBootstrapped = false;

export function App() {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const authGatewayComplete = usePreferencesStore((s) => s.authGatewayComplete);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const dailyReminder = usePreferencesStore((s) => s.dailyReminder);
  const reminderHour = usePreferencesStore((s) => s.reminderHour);
  const reminderMinute = usePreferencesStore((s) => s.reminderMinute);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const setDeferredInstallPrompt = usePreferencesStore((s) => s.setDeferredInstallPrompt);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready) || isAuthEverReady();
  const [dbReady, setDbReady] = useState(appBootstrapped);
  const [dbSeedError, setDbSeedError] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { t } = useTranslation();

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void reminderService.checkNow();
      if (user) void syncService.fullSync(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, dailyReminder, reminderHour, reminderMinute]);

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      if (user) void syncService.fullSync(false);
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [setDeferredInstallPrompt]);

  useEffect(() => {
    authService.startListener();

    if (appBootstrapped) {
      setDbReady(true);
      return;
    }

    void authService.completeRedirectSignIn().finally(() => {
      void ensureSeeded()
        .then(() => preloadCategories())
        .catch((error) => {
          console.error('[db] Seed failed', error);
          setDbSeedError(true);
        })
        .finally(() => {
          appBootstrapped = true;
          setDbReady(true);
        });
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyThemeMode(themeMode, media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    reminderService.refresh();
    return () => reminderService.stop();
  }, [dailyReminder, reminderHour, reminderMinute, locale]);

  if (!dbReady || !authReady) {
    return (
      <AppViewport scroll>
        <div className="app-shell app-boot">
          <AppBrandIcon size={72} className="app-boot__icon app-brand-icon--live" />
          {dbSeedError ? (
            <div className="app-boot__error">
              <p className="app-boot__error-title">{t('dbBootErrorTitle')}</p>
              <p className="app-boot__error-sub">{t('dbBootErrorSubtitle')}</p>
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                {t('dbBootErrorRetry')}
              </button>
            </div>
          ) : (
            <LoadingGlassSpinner label={t('loading')} />
          )}
        </div>
      </AppViewport>
    );
  }

  if (!onboardingComplete) {
    return (
      <AppViewport scroll>
        <OnboardingView onComplete={() => completeOnboarding()} />
      </AppViewport>
    );
  }

  const showAuth = (!authGatewayComplete && !user) || (authPrompt && !user);
  if (showAuth) {
    return (
      <AppViewport scroll>
        <AuthView
          isOffline={isOffline}
          allowDismiss={authPrompt}
          onDismiss={() => setAuthPrompt(false)}
          onContinueOffline={() => {
            authService.continueOffline();
            setAuthPrompt(false);
          }}
        />
      </AppViewport>
    );
  }

  return (
    <AppViewport>
      <MainShell isOffline={isOffline} onRequestSignIn={() => setAuthPrompt(true)} />
    </AppViewport>
  );
}
