import { useEffect, type JSX } from 'react';
import { MainShell } from '@/views/MainShell';
import { AuthView } from '@/views/AuthView';
import { OnboardingView } from '@/views/OnboardingView';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { applyTheme, resolveTheme } from '@/theme/tokens';
import { enableOfflinePersistence } from '@/services/firebase';
import { preferencesSync } from '@/services/preferencesSync';

export function App(): JSX.Element {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready);

  useEffect(() => {
    authService.startListener();
    return () => authService.stopListener();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(resolveTheme(themeMode, mq.matches));
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [themeMode]);

  // Spark-compatible: cache Firestore locally for brief offline / faster reloads
  useEffect(() => {
    if (!user) return;
    void enableOfflinePersistence();
  }, [user]);

  // Sync theme/locale/budget (etc.) via users/{uid}/settings/preferences — LWW by updatedAt
  useEffect(() => {
    if (!user) {
      preferencesSync.stop();
      return;
    }
    preferencesSync.start(user.uid);
    return () => preferencesSync.stop();
  }, [user]);

  // Wait for Firebase Auth to initialize before deciding what to show
  if (!authReady) {
    return (
      <div className="loading-screen" style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-background)', color: 'var(--color-accent)' }}>
        <div className="btn__spinner"><span className="spin-dot" /><span className="spin-dot" /><span className="spin-dot" /></div>
      </div>
    );
  }

  // Mandatory Sign-In
  if (!user) {
    return <AuthView />;
  }

  // Onboarding only after Auth
  if (!onboardingComplete) {
    return <OnboardingView onComplete={completeOnboarding} />;
  }

  return <MainShell />;
}
