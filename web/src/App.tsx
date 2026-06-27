import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { syncService } from '@/services/syncService';
import { resolveTheme, applyTheme } from '@/theme/tokens';
import { ensureSeeded } from '@/services/database';
import { OnboardingView } from '@/views/OnboardingView';
import { AuthView } from '@/views/AuthView';
import { MainShell } from '@/views/MainShell';
import { useTranslation } from '@/i18n';

export function App() {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready);
  const [dbReady, setDbReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    void ensureSeeded()
      .catch((error) => {
        console.error('[db] Seed failed', error);
      })
      .finally(() => setDbReady(true));
    authService.startListener();
    return () => authService.stopListener();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(resolveTheme(themeMode, media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncService.fullSync();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user]);

  if (!dbReady || !authReady) {
    return (
      <div className="app-viewport">
        <div className="app-shell app-shell--centered">{t('loading')}</div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <div className="app-viewport">
        <OnboardingView onComplete={() => completeOnboarding()} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-viewport">
        <AuthView />
      </div>
    );
  }

  return (
    <div className="app-viewport">
      <MainShell />
    </div>
  );
}
