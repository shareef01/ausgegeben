import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { reportError } from '@/services/errorReporter';

/**
 * Translation that cannot itself crash the error screen.
 *
 * `t` reads the preferences store, which is exactly the kind of thing that may be
 * broken by the time we get here. English fallbacks keep the recovery UI usable
 * even then — a screen that throws while reporting a throw leaves no way out.
 */
function tr(key: TranslationKey, fallback: string): string {
  try {
    return t(key);
  } catch {
    return fallback;
  }
}

/**
 * Drops the cached shell and reloads.
 *
 * A plain reload is not always enough: the PWA service worker serves the app shell
 * from cache, so a bad deploy keeps being replayed from disk on every reload. This
 * unregisters the worker and clears the Cache Storage entries first.
 *
 * It does NOT touch IndexedDB — that holds the Firestore offline cache, i.e. the
 * user's own transactions. Recovering from a UI crash must not risk their data.
 */
async function reloadWithoutCache(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    reportError('manual', error, { during: 'reloadWithoutCache' });
  } finally {
    window.location.reload();
  }
}

function ErrorScreen({ error }: { error: unknown }): ReactNode {
  const [resetting, setResetting] = useState(false);
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="error-screen" role="alert">
      <div className="error-screen__card">
        <h1 className="error-screen__title">{tr('errorTitle', 'something went wrong')}</h1>
        <p className="error-screen__message">
          {tr('errorMessage', 'the app hit an unexpected error. reloading usually fixes it.')}
        </p>
        <div className="error-screen__actions">
          <button
            type="button"
            className="btn btn-primary error-screen__action"
            onClick={() => window.location.reload()}
          >
            {tr('errorReload', 'reload')}
          </button>
          <button
            type="button"
            className="btn btn-secondary error-screen__action"
            disabled={resetting}
            onClick={() => {
              setResetting(true);
              void reloadWithoutCache();
            }}
          >
            {tr('errorHardReset', 'reload without cache')}
          </button>
        </div>
        {message ? (
          <details className="error-screen__details">
            <summary>{tr('errorDetails', 'error details')}</summary>
            <pre className="error-screen__stack">{message}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
}

/**
 * Last line of defence for render-time throws. Without this, React 19 unmounts the
 * whole tree on an uncaught error and leaves an empty <div id="root">, which reads
 * to the user as "the app is broken forever" — there is no in-page way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('render', error, { componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return <ErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}
