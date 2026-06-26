import { useState, type CSSProperties } from 'react';
import { usePreferencesStore } from '@/services/preferencesStore';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';

interface AuthViewProps {
  onAuthenticated: () => void;
  onDismiss?: () => void;
}

export function AuthView({ onAuthenticated, onDismiss }: AuthViewProps) {
  const { t } = useTranslation();
  const completeAuthGateway = usePreferencesStore((s) => s.completeAuthGateway);
  const syncing = useAuthStore((s) => s.syncing);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firebaseReady = authService.isAvailable();

  const continueOffline = () => {
    completeAuthGateway();
    onAuthenticated();
  };

  const handleCloudAuth = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      onAuthenticated();
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
        {onDismiss ? <button type="button" onClick={onDismiss} style={{ marginBottom: 16 }}>← {t('actionBack')}</button> : null}
        <h1 style={{ fontSize: '1.75rem' }}>
          <span className="screen-title__accent">{t('authWelcome').charAt(0)}</span>
          {t('authWelcome').slice(1)}
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>{t('authSubtitle')}</p>

        <div className="segmented" style={{ margin: '20px 0' }}>
          <button type="button" className={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')}>{t('authSignIn')}</button>
          <button type="button" className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>{t('authSignUp')}</button>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          {!firebaseReady ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: 12 }}>
              {t('authFirebaseNotConfigured')}
            </p>
          ) : null}
          <input
            placeholder={t('authEmail')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            disabled={!firebaseReady || busy}
          />
          <input
            placeholder={t('authPassword')}
            type="password"
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            disabled={!firebaseReady || busy}
          />
          {error ? <p style={{ color: 'var(--color-error)', fontSize: '0.8125rem', margin: '0 0 8px' }}>{error}</p> : null}
          {syncing ? <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: 8 }}>{t('syncInProgress')}</p> : null}
          <button
            type="button"
            disabled={!firebaseReady || busy || !email || !password}
            onClick={() => void handleCloudAuth(() => tab === 'signin'
              ? authService.signInWithEmail(email, password)
              : authService.signUpWithEmail(email, password))}
            style={{ ...btnStyle, width: '100%', marginTop: 8, opacity: !firebaseReady || busy ? 0.6 : 1 }}
          >
            {busy ? t('loading') : tab === 'signin' ? t('authSignIn') : t('authSignUp')}
          </button>
          <button
            type="button"
            disabled={!firebaseReady || busy}
            onClick={() => void handleCloudAuth(() => authService.signInWithGoogle())}
            style={{ ...btnStyle, width: '100%', marginTop: 8, background: 'var(--color-surface)', color: 'var(--color-on-background)', border: '1px solid var(--color-outline)' }}
          >
            {t('authGoogle')}
          </button>
        </div>

        <button type="button" onClick={continueOffline} disabled={busy} style={{ ...btnStyle, width: '100%', background: 'transparent', color: 'var(--color-on-background)', border: '1px solid var(--color-outline)' }}>
          {t('authContinueOffline')}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: 12, textAlign: 'center' }}>
          {t('authOfflineHint')}
        </p>
      </div>
    </div>
  );
}

function mapAuthError(code: string, t: (key: import('@/i18n').TranslationKey) => string): string {
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return t('authErrorInvalid');
  if (code.includes('auth/email-already-in-use')) return t('authErrorEmailInUse');
  if (code.includes('auth/weak-password')) return t('authErrorWeakPassword');
  if (code === 'firebase_not_configured') return t('authFirebaseNotConfigured');
  return t('authErrorGeneric');
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
