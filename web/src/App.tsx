import { useEffect, lazy, Suspense, type JSX } from 'react';
import { MainShell } from '@/views/MainShell';
import { AuthView } from '@/views/AuthView';
// New-user only — split out of the initial bundle.
const OnboardingView = lazy(() => import('@/views/OnboardingView').then((m) => ({ default: m.OnboardingView })));
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { applyTheme, resolveTheme, resolvedThemeName, writeStoredThemeMode } from '@/theme/tokens';
import { t as translate } from '@/i18n';
import { preferencesSync } from '@/services/preferencesSync';
import { seedOnboardingForUser } from '@/services/preferencesStore';
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
      document.documentElement.dataset.themeName = resolvedThemeName(themeMode, mq.matches);
      writeStoredThemeMode(themeMode);
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [themeMode]);

  // Preferences live in Firestore (users/{uid}/settings/preferences) — LWW by updatedAt
  useEffect(() => {
    if (!user) {
      preferencesSync.stop();
      // Reset only on a genuine sign-out. During Auth init the listener can emit
      // a transient null before the persisted session resolves; resetting there
      // would wipe locally-persisted prefs (e.g. the onboarding flag that keeps
      // an unverified account from re-seeing the whole flow on every reload).
      if (useAuthStore.getState().ready) {
        usePreferencesStore.getState().resetPreferences();
      }
      return;
    }
    preferencesSync.start(user.uid);
    // Restore the locally-persisted onboarding flag (per uid) before the
    // Firestore preferences snapshot resolves, so an unverified account does
    // not re-see onboarding on reload or after sign-out/sign-in.
    seedOnboardingForUser(user.uid);
    return () => preferencesSync.stop();
  }, [user]);

  // Seed after prefs (locale) are ready and email is verified — category and
  // preferences writes require email_verified in Firestore rules.
  useEffect(() => {
    if (!user || !preferencesReady || !user.emailVerified) return;
    void expenseRepository.ensureSeeded();
  }, [user, preferencesReady]);

  // Wait for Firebase Auth to initialize before deciding what to show
  if (!authReady) {
    return (
      <div
        className="loading-screen"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">{translate('loading')}</span>
        <div className="btn__spinner" aria-hidden><span className="spin-dot" /><span className="spin-dot" /><span className="spin-dot" /></div>
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
      <div
        className="loading-screen"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">{translate('loading')}</span>
        <div className="btn__spinner" aria-hidden><span className="spin-dot" /><span className="spin-dot" /><span className="spin-dot" /></div>
      </div>
    );
  }

  // Onboarding only after Auth + prefs loaded
  if (!onboardingComplete) {
    return (
      <Suspense fallback={null}>
        <OnboardingView onComplete={completeOnboarding} />
      </Suspense>
    );
  }

  return <MainShell />;
}
