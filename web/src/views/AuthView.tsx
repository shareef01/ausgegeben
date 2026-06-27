import { useState } from 'react';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';
import { SignatureText } from '@/components/ui';
import { AppBrandIcon } from '@/components/AppBrandIcon';

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
        <div className="auth-page__brand">
          <AppBrandIcon size={72} className="auth-page__app-icon" />
          <h1 className="auth-page__title">
            <SignatureText text={t('authWelcome')} as="span" />
          </h1>
          <p className="auth-page__subtitle">{t('authSubtitleCloud')}</p>
        </div>

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
            className="btn btn-secondary btn-block auth-google"
            disabled={!firebaseReady || busy}
            onClick={() => void handleGoogle()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
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
