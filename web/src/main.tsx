import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { reportError } from '@/services/errorReporter';
import { installStartupErrorHandling } from '@/services/errorSink';
import { installPreloadErrorHandler } from '@/services/staleBuild';
import { bootstrapTheme } from './theme/tokens';
import './theme/index.css';

// The persisted reporting preference gates the replay buffer before any handler can
// capture an error (PRIV-1) — buffered startup errors captured while reporting is
// opted out must never be replayed by a later opt-in.
installStartupErrorHandling();
// A dependency of a lazy chunk that the deployed build no longer serves: reload into the
// new build once queued writes have synced (staleBuild.ts).
installPreloadErrorHandler();

// Runs before React mounts, so a throw here would blank the page with the error
// boundary not yet in the tree. Unstyled is recoverable; unrendered is not.
try {
  bootstrapTheme();
} catch (error) {
  reportError('manual', error, { during: 'bootstrapTheme' });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
