import { useEffect, useRef, type JSX } from 'react';
import { useTranslation } from '@/i18n';
import { preferencesSync } from '@/services/preferencesSync';

/**
 * Recovery state for preference loading.
 *
 * Previously a preference snapshot that never arrived was indistinguishable from "this
 * account has no preferences": the app quietly continued with local defaults, which
 * could show a brand-new account the app without onboarding and left the user unaware
 * that their settings had not loaded. This screen makes the state explicit and gives
 * the user a decision: retry, or continue with what is on the device.
 */
export function PreferencesRecoveryView(): JSX.Element {
  const { t } = useTranslation();
  const retryRef = useRef<HTMLButtonElement>(null);

  // Move focus to the primary action so keyboard and screen-reader users land on it.
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  const retry = () => {
    preferencesSync.retry();
  };

  const continueWithLocal = () => {
    // Explicit, user-chosen continuation. The listener stays attached, so a later
    // server snapshot still upgrades these values (see preferencesSync.continueWithLocal
    // for how a brand-new account still reaches onboarding).
    preferencesSync.continueWithLocal();
  };

  return (
    <div className="loading-screen">
      <div className="prefs-recovery" role="alert" aria-live="assertive">
        <h1 className="prefs-recovery__title">{t('prefsLoadErrorTitle')}</h1>
        <p className="prefs-recovery__body">{t('prefsLoadErrorBody')}</p>
        <div className="prefs-recovery__actions">
          <button ref={retryRef} type="button" className="btn btn-primary" onClick={retry}>
            {t('actionRetry')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={continueWithLocal}>
            {t('prefsContinueOffline')}
          </button>
        </div>
      </div>
    </div>
  );
}
