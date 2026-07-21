import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { IconWallet, IconInsights, IconCloud, IconRecord } from '@/components/Icons';

interface OnboardingViewProps {
  onComplete: () => void;
}

const SLIDE_ICONS = [IconRecord, IconInsights, IconCloud, IconWallet];

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { t } = useTranslation();
  const pages = [
    { title: t('onboardingPage1Title'), body: t('onboardingPage1Body') },
    { title: t('onboardingPage2Title'), body: t('onboardingPage2Body') },
    { title: t('onboardingPage3Title'), body: t('onboardingPage3Body') },
    { title: t('onboardingPage4Title'), body: t('onboardingPage4Body') },
  ];
  const [step, setStep] = useState(0);
  const isLast = step >= pages.length - 1;
  const SlideIcon = SLIDE_ICONS[step] ?? IconRecord;

  return (
    <div className="app-shell auth-page onboarding-page p-4">
      <div className="auth-page__card onboarding-card monolith-container py-12">
        {!isLast && (
          <button
            type="button"
            className="onboarding-card__skip"
            onClick={onComplete}
          >
            {t('onboardingSkip')}
          </button>
        )}
        <div className="onboarding-card__hero mb-10">
          <AppBrandIcon size={72} className="onboarding-card__app-icon mb-6" />
          <h1 className="text-2xl font-extrabold tracking-tight text-on-background mb-1">
            {t('appName').toLowerCase()}
          </h1>
          <p className="text-sm font-medium text-on-surface-variant">{t('authTagline')}</p>
        </div>

        <div className="onboarding-slide">
          <div className="onboarding-slide__icon" aria-hidden>
            <SlideIcon width={32} height={32} />
          </div>
          <h2 className="onboarding-slide__title">{pages[step].title}</h2>
          <p className="onboarding-slide__body">{pages[step].body}</p>
        </div>

        <div className="onboarding-dots" role="group" aria-label={t('onboardingStepsLabel')}>
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === step ? 'step' : undefined}
              aria-label={t('onboardingStepN', { n: String(i + 1) })}
              className={`onboarding-dots__dot ${i === step ? 'onboarding-dots__dot--active' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-secondary px-6 py-3 font-semibold text-sm" onClick={() => setStep((s) => s - 1)}>
              {t('actionBack')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-primary px-8 py-3 font-bold text-sm active:scale-[0.98] transition-all duration-150"
            onClick={() => (isLast ? onComplete() : setStep((s) => s + 1))}
          >
            {isLast ? t('onboardingGetStarted') : t('onboardingNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
