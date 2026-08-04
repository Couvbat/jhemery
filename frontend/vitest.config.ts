import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Deliberately standalone rather than merged with vite.config.ts: the tests are
 * plain TypeScript, so pulling in the Vue, Tailwind, résumé and PWA plugins would
 * only add build work (and a service worker written to dist/) to every run.
 */
export default defineConfig({
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
