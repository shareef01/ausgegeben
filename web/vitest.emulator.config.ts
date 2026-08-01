import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Repository tests against the Firestore emulator. Separate from vitest.config.ts
 * because these need a running emulator — `npm test` must stay runnable offline.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['emulator/**/*.test.ts'],
    // Shared emulator state: parallel files would clear each other's data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
