import { defineConfig, devices } from '@playwright/test'
import { API_ORIGIN, BASE_URL, PREVIEW_PORT } from './e2e/constants'

/**
 * Browser-level tests, deliberately narrow.
 *
 * `src/**\/__tests__` already covers the terminal registry, every command, the games
 * and i18n in jsdom — around 1800 assertions that run in a couple of seconds. None of
 * that is repeated here. What lives in `e2e/` is the set of things jsdom structurally
 * cannot answer: that the async chunks actually load, that a section anchor really
 * scrolls, that a backend outage degrades instead of throwing, that the files the SPA
 * fallback is supposed to leave alone are still served. If a test would pass in jsdom,
 * it belongs in vitest, where it costs a hundredth as much to run.
 */

export default defineConfig({
  testDir: './e2e',
  // No `include` overlap with vitest.config.ts, which only picks up
  // `src/**/__tests__/**/*.spec.ts` — the two runners cannot collide.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Capped rather than left at Playwright's one-worker-per-core default. Every worker
  // here loads a WebGL scene, and at full width on a busy machine the run stops being
  // a test of the app and becomes a test of the CPU: assertions time out at 30–50
  // seconds in specs that pass in two when given room. Half the cores locally, two on
  // CI, where the runner also hosts the preview server.
  workers: process.env.CI ? 2 : '50%',
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  // Both raised from the defaults (30 s / 5 s), for one reason: every page load in
  // this suite pulls a 520 kB WebGL scene and starts rendering it, and the terminal
  // adds a second large chunk on top. With several workers doing that at once — on a
  // laptop that is also building, or on a two-core CI runner also hosting the preview
  // server — assertions that resolve in two seconds when given room were timing out at
  // five and failing specs that are not broken. A slow assertion should not be a
  // failing one; a genuinely broken one still fails, just five seconds later.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /**
   * The suite runs against the built `dist/`, not the dev server: what ships is a
   * minified bundle with a real service worker and real generated files
   * (`/resume.txt` comes out of a Vite plugin), and testing the dev server would
   * prove none of that.
   *
   * `VITE_API_URL` is inlined at build time — that is the whole point of the long
   * comment in `src/lib/api.ts` — so it has to be set *here*, on the build, not at run
   * time. Why it points at a same-origin path prefix rather than a dead port is
   * explained at length in `e2e/constants.ts`; the short version is that Playwright
   * cannot intercept CORS preflights, which makes every cross-origin POST pass in
   * Chromium and fail in WebKit.
   */
  webServer: {
    // `--host 127.0.0.1` is load-bearing, not tidiness: `vite preview` with no
    // host resolves `localhost` to `::1` and binds IPv6 only, so polling
    // `http://127.0.0.1:4173` never connects and the run dies at
    // "Timed out waiting from config.webServer" with a perfectly healthy server
    // sitting there. Binding the literal address is the half of the pair that
    // both `baseURL` and Playwright's readiness check agree on.
    command: `npm run build-only && npm run preview -- --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    env: { VITE_API_URL: API_ORIGIN },
    // Never reuse, not even locally. Reuse looks like a free 30 seconds and is a trap:
    // a `npm run preview` someone left running was built *without* the `env` below, so
    // `apiUrl` falls back to same-origin, every stubbed route stops matching, and the
    // preview server's SPA fallback answers `/steam/activity` with `index.html` and a
    // 200. The suite then fails in ways that point at the app instead of at the stale
    // server. Rebuilding every run is the cheaper end of that trade.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },

    // The terminal launcher is `hidden md:flex`: on a phone there is deliberately no
    // terminal at all, and the navbar collapses to a burger. That is a different
    // application surface, not a narrower one, so it gets its own project rather
    // than a viewport tweak inside a test.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },

    /**
     * Firefox and WebKit are opt-in, not part of the default (or CI) run.
     *
     * They were written, run, and taken back out, because neither could be made to
     * pass honestly:
     *
     * - **WebKit** does not intercept `POST` requests at all on the Windows build —
     *   not through `page.route`, not through `context.route`, with no service worker
     *   involved. `page.on('request')` sees the POST leave; the route handler never
     *   fires; the request reaches the preview server and 404s. Every test that sends
     *   something (contact, `mail`, `sign`) therefore fails with "the form is broken"
     *   when the form is fine. It may well behave on the Linux runners, but a
     *   required status check is not the place to find out.
     * - **Firefox** does not launch on this machine at all: `browserType.launch:
     *   spawn UNKNOWN`, every test, every retry.
     *
     * So the engines that ship are the two that were actually validated. Adding the
     * others back is one env var and one green run away — nothing else here is
     * Chromium-specific, and the fixtures deliberately avoid CDP-only features.
     */
    ...(process.env.E2E_ALL_ENGINES
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
})
