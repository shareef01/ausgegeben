import { useState } from 'react';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';

export function AuthView() {
  const { t } = useTranslation();
  const syncing = useAuthStore((s) => s.syncing);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firebaseReady = authService.isAvailable();

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (tab === 'signin') {
        await authService.signInWithEmail(email, password);
      } else {
        await authService.signUpWithEmail(email, password);
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await authService.signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell auth-page">
      <div className="auth-page__card">
        <h1 className="auth-page__title">
          <span className="screen-title__accent">{t('authWelcome').charAt(0)}</span>
          {t('authWelcome').slice(1)}
        </h1>
        <p className="auth-page__subtitle">{t('authSubtitleCloud')}</p>

        {!firebaseReady ? (
          <div className="auth-page__alert">{t('authFirebaseNotConfigured')}</div>
        ) : null}

        <div className="segmented auth-page__tabs">
          <button type="button" className={tab === 'signin' ? 'active' : ''} onClick={() => setTab('signin')}>{t('authSignIn')}</button>
          <button type="button" className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>{t('authSignUp')}</button>
        </div>

        <div className="card auth-page__form">
          <label className="field">
            <span className="field__label">{t('authEmail')}</span>
            <input
              className="field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!firebaseReady || busy}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('authPassword')}</span>
            <input
              className="field__input"
              type="password"
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!firebaseReady || busy}
              onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            />
          </label>

          {error ? <p className="auth-page__error">{error}</p> : null}
          {syncing ? <p className="auth-page__sync">{t('syncInProgress')}</p> : null}

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!firebaseReady || busy || !email || !password}
            onClick={() => void handleSubmit()}
          >
            {busy ? t('loading') : tab === 'signin' ? t('authSignIn') : t('authSignUp')}
          </button>

          <div className="auth-page__divider">{t('authOr')}</div>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!firebaseReady || busy}
            onClick={() => void handleGoogle()}
          >
            {t('authGoogle')}
          </button>
        </div>

        <p className="auth-page__hint">{t('authCloudHint')}</p>
      </div>
    </div>
  );
}

function mapAuthError(code: string, t: (key: import('@/i18n').TranslationKey) => string): string {
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return t('authErrorInvalid');
  if (code.includes('auth/email-already-in-use')) return t('authErrorEmailInUse');
  if (code.includes('auth/weak-password')) return t('authErrorWeakPassword');
  if (code.includes('auth/unauthorized-domain')) return t('authErrorUnauthorizedDomain');
  if (code.includes('auth/popup-closed-by-user')) return t('authErrorPopupClosed');
  if (code === 'firebase_not_configured') return t('authFirebaseNotConfigured');
  return t('authErrorGeneric');
}
