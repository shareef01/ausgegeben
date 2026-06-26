import { useState, type CSSProperties } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useTranslation } from '@/i18n';

interface AuthViewProps {
  onAuthenticated: () => void;
  onDismiss?: () => void;
}

export function AuthView({ onAuthenticated, onDismiss }: AuthViewProps) {
  const { t } = useTranslation();
  const completeAuthGateway = usePreferencesStore((s) => s.completeAuthGateway);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  const continueOffline = () => {
    completeAuthGateway();
    onAuthenticated();
  };

  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
        {onDismiss ? <button type="button" onClick={onDismiss} style={{ marginBottom: 16 }}>← Back</button> : null}
        <h1 style={{ fontSize: '1.75rem' }}><span className="screen-title__accent">W</span>elcome back</h1>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Sign in to sync across devices, or stay fully offline.</p>

        <div className="segmented" style={{ margin: '20px 0' }}>
          <button type="button" className={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')}>Sign in</button>
          <button type="button" className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>Sign up</button>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            Firebase Auth (email, Google) ships in Phase 3. Configure `VITE_FIREBASE_*` env vars to enable cloud sync — same Firestore schema as the Android app.
          </p>
          <input placeholder="Email" style={inputStyle} />
          <input placeholder="Password" type="password" style={inputStyle} />
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5, marginTop: 8 }}>Cloud sign-in (coming soon)</button>
        </div>

        <button type="button" onClick={continueOffline} style={{ ...btnStyle, width: '100%', background: 'transparent', color: 'var(--color-on-background)', border: '1px solid var(--color-outline)' }}>
          {t('authContinueOffline')}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: 12, textAlign: 'center' }}>
          Offline mode stores everything in your browser via IndexedDB.
        </p>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--color-outline)',
  marginBottom: 8,
  background: 'var(--color-surface)',
  color: 'inherit',
};

const btnStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 999,
  background: 'var(--color-accent)',
  color: '#fff',
  fontWeight: 600,
  border: 'none',
};
