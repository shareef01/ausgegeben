import { useState } from 'react';
import { useTranslation } from '@/i18n';
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
    <div className="app-shell auth-page onboarding-page">
      <div className="auth-page__card onboarding-card">
        <div className="onboarding-card__hero">
          <span className="brand-mark brand-mark--lg" aria-hidden>A</span>
          <h1 className="onboarding-card__title">Ausgegeben</h1>
          <p className="onboarding-card__tagline">{t('authTagline')}</p>
        </div>

        <div className="onboarding-slide">
          <div className="onboarding-slide__icon" aria-hidden>
            <SlideIcon width={32} height={32} />
          </div>
          <h2 className="onboarding-slide__title">{pages[step].title}</h2>
          <p className="onboarding-slide__body">{pages[step].body}</p>
        </div>

        <div className="onboarding-dots" role="tablist" aria-label="Onboarding steps">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}`}
              className={`onboarding-dots__dot ${i === step ? 'onboarding-dots__dot--active' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
              {t('actionBack')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (isLast ? onComplete() : setStep((s) => s + 1))}
          >
            {isLast ? t('onboardingGetStarted') : t('onboardingNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
