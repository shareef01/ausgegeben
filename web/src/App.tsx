import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { resolveTheme, applyTheme } from '@/theme/tokens';
import { ensureSeeded } from '@/services/database';
import { OnboardingView } from '@/views/OnboardingView';
import { AuthView } from '@/views/AuthView';
import { MainShell } from '@/views/MainShell';
import { useTranslation } from '@/i18n';

export function App() {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const authGatewayComplete = usePreferencesStore((s) => s.authGatewayComplete);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const authReady = useAuthStore((s) => s.ready);
  const [dbReady, setDbReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    void ensureSeeded().then(() => setDbReady(true));
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

  if (!dbReady || !authReady) {
    return <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>{t('loading')}</div>;
  }

  if (!onboardingComplete) {
    return <OnboardingView onComplete={() => completeOnboarding()} />;
  }

  if (!authGatewayComplete) {
    return <AuthView onAuthenticated={() => {}} />;
  }

  return <MainShell />;
}
