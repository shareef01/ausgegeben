import { strings } from '@/i18n/en';

interface OnboardingViewProps {
  onComplete: () => void;
}

const pages = [
  { title: 'Track every expense', body: 'Log spending, income, and transfers in seconds with a purpose-built numpad.' },
  { title: 'See where money goes', body: 'Donut charts and cash-flow trends turn your history into clear insights.' },
  { title: 'Stay on budget', body: 'Set a monthly cap and watch your progress on the Record tab.' },
  { title: 'Works offline', body: 'Your data lives on this device. Sign in later to sync across devices with Firebase.' },
];

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>
          <span className="screen-title__accent">A</span>usgegeben
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: 32 }}>{strings.authTagline}</p>
        {pages.map((p) => (
          <div key={p.title} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9375rem' }}>{p.body}</div>
          </div>
        ))}
        <button type="button" onClick={onComplete} style={{ width: '100%', padding: 14, borderRadius: 999, background: 'var(--color-accent)', color: '#fff', fontWeight: 600, marginTop: 16 }}>
          {strings.onboardingGetStarted}
        </button>
      </div>
    </div>
  );
}
