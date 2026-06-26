import { useTranslation } from '@/i18n';

interface OnboardingViewProps {
  onComplete: () => void;
}

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { t } = useTranslation();
  const pages = [
    { title: t('onboardingPage1Title'), body: t('onboardingPage1Body') },
    { title: t('onboardingPage2Title'), body: t('onboardingPage2Body') },
    { title: t('onboardingPage3Title'), body: t('onboardingPage3Body') },
    { title: t('onboardingPage4Title'), body: t('onboardingPage4Body') },
  ];
  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>
          <span className="screen-title__accent">A</span>usgegeben
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 32 }}>{t('authTagline')}</p>
        {pages.map((p) => (
          <div key={p.title} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9375rem' }}>{p.body}</div>
          </div>
        ))}
        <button type="button" onClick={onComplete} style={{ width: '100%', padding: 14, borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontWeight: 600, marginTop: 16 }}>
          {t('onboardingGetStarted')}
        </button>
      </div>
    </div>
  );
}
