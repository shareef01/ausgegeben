import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser regression coverage for auth/session lifecycle guarantees that no unit
 * test (which mocks the Firebase SDK and browser storage) can actually verify — see
 * AUTH-1, AUTH-2, and TEST-1. Runs against the Vite dev server in `emulator` mode
 * (`.env.emulator`) plus real Firebase Auth + Firestore emulators (started by the
 * `test:e2e` npm script, matching the pattern already used by `test:rules`/`test:emulator`).
 *
 * Deliberately small and focused: this is not a full-application E2E suite, only the
 * handful of browser-storage/cross-tab scenarios unit tests structurally cannot cover.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one emulator's auth/Firestore state
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --mode emulator --port 5183 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
