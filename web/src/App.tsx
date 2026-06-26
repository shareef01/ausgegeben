import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { resolveTheme, applyTheme } from '@/theme/tokens';
import { ensureSeeded } from '@/services/database';
import { OnboardingView } from '@/views/OnboardingView';
import { AuthView } from '@/views/AuthView';
import { MainShell } from '@/views/MainShell';

export function App() {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const authGatewayComplete = usePreferencesStore((s) => s.authGatewayComplete);
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void ensureSeeded().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(resolveTheme(themeMode, media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themeMode]);

  if (!ready) {
    return <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>Loading…</div>;
  }

  if (!onboardingComplete) {
    return <OnboardingView onComplete={() => completeOnboarding()} />;
  }

  if (!authGatewayComplete) {
    return <AuthView onAuthenticated={() => {}} />;
  }

  return <MainShell />;
}
