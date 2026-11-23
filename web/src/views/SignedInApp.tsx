import { lazy, Suspense, useEffect } from 'react';
import { AppLoading } from '@/components/AppLoading';
import { MainShell } from '@/views/MainShell';
import { PreferencesRecoveryView } from '@/views/PreferencesRecoveryView';
import type { AuthUser } from '@/services/authStore';
import { seedOnboardingForUser, usePreferencesStore } from '@/services/preferencesStore';
import { preferencesSync } from '@/services/preferencesSync';
import { isPreferencesSettled, preferencesScreenFor } from '@/services/prefsLoadState';
import { expenseRepository } from '@/repositories/expenseRepository';
import { guardChunkImport } from '@/services/staleBuild';
import { staleBuildModule } from '@/components/StaleBuildNotice';

const OnboardingView = lazy(guardChunkImport(
  () => import('@/views/OnboardingView').then((module) => ({ default: module.OnboardingView })),
  () => staleBuildModule as never,
));

export function SignedInApp({ user }: { user: AuthUser }) {
  const onboardingComplete = usePreferencesStore((s) => s.onboardingComplete);
  const onboardingKnown = usePreferencesStore((s) => s.onboardingKnown);
  const preferencesStatus = usePreferencesStore((s) => s.preferencesStatus);
  const completeOnboarding = usePreferencesStore((s) => s.completeOnboarding);
  const { uid, emailVerified } = user;

  useEffect(() => {
    preferencesSync.start(uid);
    // Recover the per-account onboarding flag before the preferences snapshot arrives.
    seedOnboardingForUser(uid);
    return () => preferencesSync.stop();
  }, [uid, emailVerified]);

  const preferencesSettled = isPreferencesSettled(preferencesStatus);
  useEffect(() => {
    if (preferencesSettled && emailVerified) void expenseRepository.ensureSeeded();
  }, [uid, preferencesSettled, emailVerified]);

  const screen = preferencesScreenFor({ status: preferencesStatus, onboardingKnown, onboardingComplete });
  if (screen === 'loading') return <AppLoading />;
  if (screen === 'recovery') return <PreferencesRecoveryView />;
  if (screen === 'onboarding') {
    return (
      <Suspense fallback={<AppLoading />}>
        <OnboardingView onComplete={completeOnboarding} />
      </Suspense>
    );
  }

  return <MainShell />;
}
