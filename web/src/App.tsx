import { useEffect, type JSX } from 'react';
import { MainShell } from '@/views/MainShell';
import { AuthView } from '@/views/AuthView';
import { OnboardingView } from '@/views/OnboardingView';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { applyTheme, resolveTheme } from '@/theme/tokens';
import { preferencesSync } from '@/services/preferencesSync';
import { expenseRepository } from '@/repositories/expenseRepository';

try {
  localStorage.removeItem('ausgegeben-preferences');
} catch {
  // Ignore quota / private-mode failures
}

export function App(): JSX.Element {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const preferencesReady = usePreferencesStore((s) => s.preferencesReady);
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
    const update = () => {
      applyTheme(resolveTheme(themeMode, mq.matches));
      // Expose the resolved palette name so per-theme CSS (e.g. accent-forward
      // light themes) can target it; 'system' collapses to dark/light.
      const name = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.dataset.themeName = name;
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [themeMode]);

  // Preferences live in Firestore (users/{uid}/settings/preferences) — LWW by updatedAt
  useEffect(() => {
    if (!user) {
      preferencesSync.stop();
      usePreferencesStore.getState().resetPreferences();
      return;
    }
    preferencesSync.start(user.uid);
    return () => preferencesSync.stop();
  }, [user]);

  // Seed default categories for empty accounts (same set as Android)
  useEffect(() => {
    if (!user) return;
    void expenseRepository.ensureSeeded();
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

  // Wait for Firestore preferences before onboarding gate (avoids flash)
  if (!preferencesReady) {
    return (
      <div className="loading-screen" style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-background)', color: 'var(--color-accent)' }}>
        <div className="btn__spinner"><span className="spin-dot" /><span className="spin-dot" /><span className="spin-dot" /></div>
      </div>
    );
  }

  // Onboarding only after Auth + prefs loaded
  if (!onboardingComplete) {
    return <OnboardingView onComplete={completeOnboarding} />;
  }

  return <MainShell />;
}
