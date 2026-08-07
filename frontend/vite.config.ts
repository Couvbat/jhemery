import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resumePlugin } from './vite-plugins/resume'
import { thirdPartyPlugin } from './vite-plugins/third-party'
import { profile } from './src/content/profile'

/** Short commit SHA for the footer. Falls back to `dev` outside a git checkout. */
function commitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    resumePlugin(),
    thirdPartyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // Left off in dev: a service worker sitting in front of the dev server
      // fights HMR and makes "why is my edit not showing" a recurring puzzle.
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: `${profile.name} — Portfolio`,
        short_name: profile.alias,
        description: profile.tagline.en,
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        // Matches <meta name="theme-color"> in index.html; the palette is
        // committed to always-dark (features-spec §10) so there is no light variant.
        theme_color: '#0d0f0d',
        background_color: '#0d0f0d',
        categories: ['portfolio', 'developer', 'personal'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: [
          '**/node_modules/**/*',
          // ~520 kB of three.js, deliberately code-split and deferred to idle so
          // first paint never pays for it. Precaching would pull it down on every
          // first visit and undo exactly that — including for reduced-motion
          // visitors, who never load it at all. The runtime rule below still
          // caches it the first time someone actually gets the background.
          '**/ThreeBackground-*.js',
          // ~51 kB that only social/link-preview crawlers ever fetch, and none of
          // them run a service worker. Precaching it is pure waste on every install.
          '**/og-image.*',
          // ~60 kB gzipped of wordle/typing dictionaries, split per locale and
          // fetched only when someone runs a word game — which most visitors
          // never do, and nobody does in the locale they are not reading. Same
          // reasoning as three.js above: precaching would undo the code-split.
          // The runtime rule below still caches them once actually used.
          '**/words-??-*.js',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Real files that a browser can navigate straight to. Without this the
          // SW would answer them with index.html, silently breaking `/resume.txt`
          // and the machine-readable endpoints.
          /^\/resume\.txt$/,
          /^\/llms\.txt$/,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/og-image\.(png|svg)$/,
          // Third-party notices, emitted by `vite-plugins/third-party.ts`.
          // They have to be reachable in the *deployed* copy, not just the
          // repository, because that is what the licences require.
          /^\/THIRD-PARTY\.txt$/,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // The code-split chunks that were too big to precache.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && (request.destination === 'script' || request.destination === 'style'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'async-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // The API is intentionally absent from runtimeCaching. Every live-data
        // command already degrades to a useful message when the backend is
        // unreachable (features-spec §3), and a cached Steam/Discord presence is
        // worse than an honest "unavailable" — it would show a stale "in game".
      },
    }),
  ],
  define: {
    __BUILD_SHA__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
