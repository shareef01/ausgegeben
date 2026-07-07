import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { OnboardingPager } from '@/components/OnboardingPager';
import { IconInsights, IconRecord, IconBell, IconTouch } from '@/components/Icons';
import { usePreferencesStore } from '@/services/preferencesStore';
import { reminderService } from '@/services/reminderService';
import { hapticLight, hapticMedium, hapticSuccess } from '@/utils/haptics';
import { canShowIosInstallHint } from '@/utils/pwaUtils';

interface OnboardingViewProps {
  onComplete: () => void;
}

const SLIDE_ICONS = [IconRecord, IconInsights, IconBell, IconTouch];

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { t } = useTranslation();
  const setDailyReminder = usePreferencesStore((s) => s.setDailyReminder);
  const pages = [
    { title: t('onboardingPage1Title'), body: t('onboardingPage1Body') },
    { title: t('onboardingPage2Title'), body: t('onboardingPage2Body') },
    { title: t('onboardingPage3Title'), body: t('onboardingPage3Body') },
    { title: t('onboardingPage4Title'), body: t('onboardingPage4Body') },
  ];
  const [step, setStep] = useState(0);
  const isLast = step >= pages.length - 1;
  const showIosInstallHint = isLast && canShowIosInstallHint();

  const finishWithReminders = async () => {
    const granted = await reminderService.requestPermission();
    if (granted) {
      setDailyReminder(true);
    }
    onComplete();
  };

  return (
    <div className="app-shell auth-page onboarding-page">
      <div className="auth-page__card onboarding-card card insights-glass-island chart-reveal-in">
        <div className="onboarding-card__hero">
          <AppBrandIcon size={72} className="onboarding-card__app-icon" />
          <h1 className="onboarding-card__title">
            <SignatureText text={t('appName')} as="span" />
          </h1>
          <p className="onboarding-card__tagline">{t('authTagline')}</p>
        </div>

        <OnboardingPager step={step} pageCount={pages.length} onStepChange={setStep}>
          {pages.map((page, index) => {
            const SlideIcon = SLIDE_ICONS[index] ?? IconRecord;
            return (
              <div key={page.title} className="onboarding-pager__slide">
                <div className={`onboarding-slide${step === index ? ' onboarding-slide--active' : ''}`}>
                  <div className="onboarding-slide__icon" aria-hidden>
                    <SlideIcon width={32} height={32} />
                  </div>
                  <h2 className="onboarding-slide__title">{page.title}</h2>
                  <p className="onboarding-slide__body">{page.body}</p>
                </div>
              </div>
            );
          })}
        </OnboardingPager>

        <div className="onboarding-dots" role="tablist" aria-label={t('onboardingDotsLabel')}>
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={t('descPageIndicator', { current: String(i + 1), total: String(pages.length) })}
              className={`onboarding-dots__dot ${i === step ? 'onboarding-dots__dot--active' : ''}`}
              onClick={() => {
                hapticLight();
                setStep(i);
              }}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => { hapticLight(); setStep((s) => s - 1); }}>
              {t('actionBack')}
            </button>
          ) : null}
          {isLast ? (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => { hapticSuccess(); onComplete(); }}>
                {t('onboardingGetStarted')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block onboarding-actions__text"
                onClick={() => { hapticMedium(); void finishWithReminders(); }}
              >
                {t('onboardingEnableReminders')}
              </button>
              {showIosInstallHint ? (
                <p className="onboarding-ios-hint">{t('onboardingIosInstallHint')}</p>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => { hapticLight(); setStep((s) => s + 1); }}>
                {t('onboardingNext')}
              </button>
              <button type="button" className="btn btn-secondary btn-block onboarding-actions__text" onClick={() => { hapticLight(); onComplete(); }}>
                {t('onboardingSkip')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
