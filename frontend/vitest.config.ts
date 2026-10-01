import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Deliberately standalone rather than merged with vite.config.ts: the tests are
 * plain TypeScript, so pulling in the Vue, Tailwind, résumé and PWA plugins would
 * only add build work (and a service worker written to dist/) to every run.
 */
export default defineConfig({
  // The build's commit and time, as `vite.config.ts` defines them. `'dev'` is what a
  // build outside a checkout gets, so links pinned to it fall back to `master`.
  define: {
    __BUILD_SHA__: JSON.stringify('dev'),
    __BUILD_TIME__: JSON.stringify('2026-01-01T00:00:00.000Z'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // i18n and the terminal history read localStorage/navigator at module scope.
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.spec.ts'],
    restoreMocks: true,
  },
})
