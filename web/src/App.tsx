import { useEffect, lazy, Suspense, type JSX } from 'react';
import { AppLoading } from '@/components/AppLoading';
import { AuthView } from '@/views/AuthView';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { prepareFirebaseFirestore } from '@/services/firebase';
import { hasPendingLocalCleanup, retryPendingLocalCleanup } from '@/services/localCleanup';
import { guardChunkImport } from '@/services/staleBuild';
import { staleBuildModule } from '@/components/StaleBuildNotice';
import { applyTheme, resolveTheme, resolvedThemeName, writeStoredThemeMode } from '@/theme/tokens';

const SignedInApp = lazy(guardChunkImport(async () => {
  const [module] = await Promise.all([import('@/views/SignedInApp'), prepareFirebaseFirestore()]);
  return { default: module.SignedInApp };
}, () => staleBuildModule as never));

/** The interrupted-cleanup retry runs at most once per page load (see App). */
let launchCleanupRetried = false;

try {
  localStorage.removeItem('ausgegeben-preferences');
} catch {
  // Ignore quota / private-mode failures.
}

export function App(): JSX.Element {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready);
  const endingSession = useAuthStore((s) => s.endingSession);

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

  useEffect(() => {
    // Not while a sign-out is still wiping: its own cleanup is running, and a concurrent
    // retry of the same marker would race it.
    if (authReady && !user && !endingSession) {
      usePreferencesStore.getState().resetPreferences();
      // A previous sign-out/account deletion may have been interrupted (a blocked
      // IndexedDB connection, denied storage, or the tab closing mid-wipe). Finish the
      // local wipe now, when no account is active, so the marker never lingers across a
      // new session. Once per load, and behind the same gate as a sign-out: a sign-in
      // racing the wipe would have its fresh Firestore instance terminated by it. A
      // sign-out in this load has just run the same steps itself, and a wipe that keeps
      // failing must not keep the sign-in form away; the marker waits for the next launch.
      if (!launchCleanupRetried && hasPendingLocalCleanup()) {
        launchCleanupRetried = true;
        useAuthStore.getState().setEndingSession(true);
        void retryPendingLocalCleanup().finally(() => useAuthStore.getState().setEndingSession(false));
      }
    }
  }, [authReady, user, endingSession]);

  if (!authReady) return <AppLoading />;
  // The sign-in form waits for a sign-out's local wipe to finish (AuthStore.endingSession).
  if (!user) return endingSession ? <AppLoading /> : <AuthView />;

  return (
    <Suspense fallback={<AppLoading />}>
      <SignedInApp key={user.uid} user={user} />
    </Suspense>
  );
}
