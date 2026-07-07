import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '@/services/authStore';
import { authService } from '@/services/authService';
import { useTranslation } from '@/i18n';
import { AppBrandIcon } from '@/components/AppBrandIcon';
import { IosSegmentedControl } from '@/components/IosSegmentedControl';
import { IconArrowLeft, IconCloudOff } from '@/components/Icons';
import { hapticLight } from '@/utils/haptics';

interface AuthViewProps {
  isOffline?: boolean;
  allowDismiss?: boolean;
  onDismiss?: () => void;
  onContinueOffline: () => void;
}

export function AuthView({ isOffline = false, allowDismiss, onDismiss, onContinueOffline }: AuthViewProps) {
  const { t } = useTranslation();
  const syncing = useAuthStore((s) => s.syncing);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firebaseReady = authService.isAvailable();

  const handleTabChange = (next: 'signin' | 'signup') => {
    setTab(next);
    setError(null);
    setInfo(null);
    setConfirmPassword('');
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
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
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await authService.signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      if (code.includes('auth/popup-closed-by-user') || code.includes('auth/cancelled-popup-request')) {
        return;
      }
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
      await authService.sendPasswordReset(email);
      setInfo(t('authResetEmailSent'));
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e instanceof Error ? e.message : 'auth_error');
      setError(mapAuthError(code, t));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = Boolean(email && password && (tab === 'signin' || confirmPassword));
  const signInBlocked = isOffline || !firebaseReady;

  return (
    <div className="app-shell auth-page">
      {allowDismiss && onDismiss ? (
        <button type="button" className="auth-page__back add-sheet__icon-btn insights-glass-island" onClick={onDismiss} aria-label={t('actionBack')}>
          <IconArrowLeft width={20} height={20} />
        </button>
      ) : null}

      <div className="auth-page__card">
        <div className="auth-page__brand chart-reveal-in">
          <AppBrandIcon size={80} className="auth-page__app-icon app-brand-icon--live" />
          <h1 className="auth-page__logo-text">ausgegeben</h1>
          <p className="auth-page__tagline">{t('authTagline')}</p>
        </div>

        {!firebaseReady ? (
          <div className="auth-page__alert" role="alert">{t('authFirebaseNotConfigured')}</div>
        ) : null}

        {isOffline ? (
          <div className="offline-banner offline-banner--auth insights-glass-island" role="alert">
            <span className="offline-banner__stripe" aria-hidden />
            <div className="offline-banner__body">{t('offlineNotice')}</div>
          </div>
        ) : null}

        <div className="card auth-page__hero-card insights-glass-island chart-reveal-in chart-reveal-in--delay-1">
          <IosSegmentedControl
            className="auth-page__tabs"
            options={[
              { value: 'signin' as const, label: t('authSignIn') },
              { value: 'signup' as const, label: t('authSignUp') },
            ]}
            value={tab}
            onChange={handleTabChange}
          />

          <div className="auth-page__form">
            <label className="field auth-field">
              <span className="field__label">{t('authEmail')}</span>
              <div className="auth-field__wrap">
                <Mail size={18} className="auth-field__icon" aria-hidden />
                <input
                  className="field__input auth-field__input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={signInBlocked || busy}
                />
              </div>
            </label>

            <PasswordField
              label={t('authPassword')}
              value={password}
              onChange={setPassword}
              visible={passwordVisible}
              onToggleVisible={() => setPasswordVisible((v) => !v)}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              disabled={signInBlocked || busy}
              onEnter={() => void handleSubmit()}
              toggleLabel={t('authTogglePassword')}
            />

            {tab === 'signup' ? (
              <PasswordField
                label={t('authConfirmPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                visible={passwordVisible}
                onToggleVisible={() => setPasswordVisible((v) => !v)}
                autoComplete="new-password"
                disabled={signInBlocked || busy}
                onEnter={() => void handleSubmit()}
                toggleLabel={t('authTogglePassword')}
              />
            ) : null}

            {tab === 'signin' && firebaseReady && !isOffline ? (
              <button
                type="button"
                className="auth-page__forgot"
                disabled={busy}
                onClick={() => void handleForgotPassword()}
              >
                {t('authForgotPassword')}
              </button>
            ) : null}

            {error ? <p className="auth-page__error" role="alert">{error}</p> : null}
            {info ? <p className="auth-page__info" role="status">{info}</p> : null}
            {syncing ? <p className="auth-page__sync" role="status" aria-live="polite">{t('syncInProgress')}</p> : null}

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={signInBlocked || busy || !canSubmit}
              onClick={() => {
                hapticLight();
                void handleSubmit();
              }}
            >
              {busy ? t('loading') : tab === 'signin' ? t('authSignIn') : t('authCreateAccount')}
            </button>
          </div>
        </div>

        {firebaseReady && !isOffline ? (
          <>
            <div className="auth-page__divider">{t('authOr')}</div>
            <button
              type="button"
              className="btn btn-secondary btn-block auth-google insights-glass-island"
              disabled={busy}
              onClick={() => void handleGoogleSignIn()}
            >
              {t('authContinueGoogle')}
            </button>
          </>
        ) : null}

        <p className="auth-page__hint">{t('authCloudHint')}</p>

        <div className="card auth-page__offline-card insights-glass-island chart-reveal-in chart-reveal-in--delay-1">
          <button
            type="button"
            className="btn btn-secondary btn-block auth-page__offline"
            disabled={busy}
            onClick={() => {
              hapticLight();
              onContinueOffline();
            }}
          >
            <IconCloudOff width={18} height={18} aria-hidden />
            {t('authContinueOffline')}
          </button>
          {!allowDismiss ? (
            <p className="auth-page__hint auth-page__hint--muted">{t('authOfflineHint')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  autoComplete,
  disabled,
  onEnter,
  toggleLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  autoComplete: string;
  disabled?: boolean;
  onEnter?: () => void;
  toggleLabel: string;
}) {
  return (
    <label className="field auth-field auth-password-field">
      <span className="field__label">{label}</span>
      <div className="auth-field__wrap auth-password-field__wrap">
        <Lock size={18} className="auth-field__icon" aria-hidden />
        <input
          className="field__input auth-field__input auth-password-field__input"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
        <button
          type="button"
          className="auth-password-field__toggle"
          onClick={onToggleVisible}
          disabled={disabled}
          aria-label={toggleLabel}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </label>
  );
}

function mapAuthError(code: string, t: (key: import('@/i18n').TranslationKey) => string): string {
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return t('authErrorInvalid');
  if (code.includes('auth/email-already-in-use')) return t('authErrorEmailInUse');
  if (code.includes('auth/weak-password')) return t('authErrorWeakPassword');
  if (code.includes('auth/unauthorized-domain')) return t('authErrorUnauthorizedDomain');
  if (code === 'firebase_not_configured') return t('authFirebaseNotConfigured');
  if (code === 'auth/email-required') return t('authErrorEmailRequired');
  return t('authErrorGeneric');
}
