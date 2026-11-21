import { useEffect, lazy, Suspense, type JSX } from 'react';
import { AppLoading } from '@/components/AppLoading';
import { AuthView } from '@/views/AuthView';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { prepareFirebaseFirestore } from '@/services/firebase';
import { applyTheme, resolveTheme, resolvedThemeName, writeStoredThemeMode } from '@/theme/tokens';

const SignedInApp = lazy(async () => {
  const [module] = await Promise.all([import('@/views/SignedInApp'), prepareFirebaseFirestore()]);
  return { default: module.SignedInApp };
});

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
    if (authReady && !user) usePreferencesStore.getState().resetPreferences();
  }, [authReady, user]);

  if (!authReady) return <AppLoading />;
  if (!user) return <AuthView />;

  return (
    <Suspense fallback={<AppLoading />}>
      <SignedInApp key={user.uid} user={user} />
    </Suspense>
  );
}
