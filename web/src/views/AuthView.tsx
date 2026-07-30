import { useState } from 'react';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconEye, IconEyeOff } from '@/components/Icons';

export function AuthView() {
  const { t } = useTranslation();
  const syncing = useAuthStore((s) => s.syncing);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firebaseReady = authService.isAvailable();
  const passwordTooShort = tab === 'signup' && password.length > 0 && password.length < 8;

  const switchTab = (next: 'signin' | 'signup') => {
    setTab(next);
    setError(null);
    setInfo(null);
    setConfirmPassword('');
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('authErrorEmailRequired'));
      return;
    }
    if (tab === 'signup' && password.length < 8) {
      setError(t('authErrorWeakPassword'));
      return;
    }
    if (tab === 'signup' && password !== confirmPassword) {
      setError(t('authErrorPasswordMismatch'));
      return;
    }
    setBusy(true);
    try {
      if (tab === 'signin') {
        await authService.signInWithEmail(email, password);
      } else {
        await authService.signUpWithEmail(email, password);
        setInfo(t('authVerifyEmailSent'));
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'auth_error';
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t('authErrorEmailRequired'));
      return;
    }
    setBusy(true);
    try {
      await authService.sendPasswordResetEmail(email);
      setInfo(t('authResetEmailSent'));
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'auth_error';
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    !firebaseReady ||
    busy ||
    !email ||
    !password ||
    passwordTooShort ||
    (tab === 'signup' && !confirmPassword);

  return (
    <div className="app-shell auth-page">
      <div className="auth-page__card">
        <div className="auth-page__brand mb-10">
          <AppBrandIcon size={72} className="mb-6" />
          <h1 className="auth-page__logo-text text-3xl font-extrabold tracking-tight text-on-background">
            {t('appName').toLowerCase()}
          </h1>
          <p className="auth-page__tagline text-xs font-bold uppercase tracking-widest">{t('authTagline')}</p>
        </div>

        {!firebaseReady ? (
          <div className="auth-page__alert" role="alert">{t('authFirebaseNotConfigured')}</div>
        ) : null}

        <IosSegmentedControl
          className="auth-page__tabs"
          aria-label={`${t('authSignIn')} / ${t('authSignUp')}`}
          options={[
            { value: 'signin' as const, label: t('authSignIn') },
            { value: 'signup' as const, label: t('authSignUp') },
          ]}
          value={tab}
          onChange={switchTab}
        />

        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="auth-page__form space-y-4">
          <div>
            <label htmlFor="auth-email" className="field__label">{t('authEmail')}</label>
            <input
              id="auth-email"
              className="field__input"
              type="email"
              autoComplete="email"
              placeholder={t('authEmailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!firebaseReady || busy}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="field__label">{t('authPassword')}</label>
            <div className="auth-page__password">
              <input
                id="auth-password"
                className="field__input auth-page__password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!firebaseReady || busy}
                aria-describedby={passwordTooShort ? 'auth-password-hint' : undefined}
              />
              <button
                type="button"
                className="auth-page__password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('authHidePassword') : t('authShowPassword')}
                tabIndex={0}
              >
                {showPassword ? <IconEyeOff width={18} height={18} aria-hidden /> : <IconEye width={18} height={18} aria-hidden />}
              </button>
            </div>
            {passwordTooShort ? (
              <p id="auth-password-hint" className="auth-page__field-hint" role="status">
                {t('authErrorWeakPassword')}
              </p>
            ) : null}
          </div>

          {tab === 'signup' ? (
            <div>
              <label htmlFor="auth-confirm-password" className="field__label">{t('authConfirmPassword')}</label>
              <input
                id="auth-confirm-password"
                className="field__input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!firebaseReady || busy}
              />
            </div>
          ) : null}

          {error ? <p className="auth-page__error" role="alert">{error}</p> : null}
          {info ? <p className="auth-page__info" role="status" aria-live="polite">{info}</p> : null}
          {syncing ? <p className="auth-page__sync" role="status" aria-live="polite">{t('syncInProgress')}</p> : null}

          <button
            type="submit"
            className="btn btn-primary w-full py-3.5 rounded-xl text-sm hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={submitDisabled}
          >
            <span key={busy ? 'busy' : tab} className="auth-page__submit-label">
              {busy ? t('loading') : tab === 'signin' ? t('authSignIn') : t('authSignUp')}
            </span>
          </button>

          {tab === 'signin' ? (
            <button
              type="button"
              className="auth-page__forgot"
              onClick={() => void handleForgotPassword()}
              disabled={!firebaseReady || busy}
            >
              {t('authForgotPassword')}
            </button>
          ) : null}
        </form>

        <p className="auth-page__hint text-center text-xs mt-6">{t('authOfflineHint')}</p>
      </div>
    </div>
  );
}

function mapAuthError(code: string, t: (key: import('@/i18n').TranslationKey) => string): string {
  if (code.startsWith('auth/invalid-credential') || code.startsWith('auth/wrong-password')) return t('authErrorInvalid');
  if (code.startsWith('auth/user-not-found')) return t('authErrorInvalid');
  if (code.startsWith('auth/email-already-in-use')) return t('authErrorEmailInUse');
  if (code.startsWith('auth/weak-password')) return t('authErrorWeakPassword');
  if (code.startsWith('auth/unauthorized-domain')) return t('authErrorUnauthorizedDomain');
  if (code === 'firebase_not_configured') return t('authFirebaseNotConfigured');
  return t('authErrorGeneric');
}
