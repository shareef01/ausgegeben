import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installGlobalErrorHandlers, reportError } from '@/services/errorReporter';
import { installConfiguredErrorSink } from '@/services/errorSink';
import { bootstrapTheme } from './theme/tokens';
import './theme/index.css';

installGlobalErrorHandlers();
// No-op unless VITE_ERROR_REPORT_URL is set; buffered reports replay on attach.
installConfiguredErrorSink();

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
