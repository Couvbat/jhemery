export const PREVIEW_PORT = 4173
export const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`

/**
 * Where the app under test thinks the backend lives. Shared by `playwright.config.ts`
 * and the API fixture, which have to agree exactly: the config inlines it into the
 * bundle at build time (`VITE_API_URL`), and the fixture intercepts it at run time.
 *
 * **Same origin as the page, under a path prefix that exists nowhere else.** The
 * obvious choice — a dead port like `http://127.0.0.1:9999` — passes in Chromium and
 * fails in WebKit and Firefox, for a reason worth writing down: a cross-origin POST
 * carrying `Content-Type: application/json` is not a simple request, so the browser
 * sends a CORS preflight first, and **Playwright cannot intercept preflights**. In
 * Chromium the interception sidesteps CORS entirely and nobody notices; in WebKit the
 * `OPTIONS` goes to the real network, finds nothing on port 9999, and the POST is
 * never sent at all. The fixture then sees no request, and the test fails claiming
 * the contact form is broken.
 *
 * Same-origin means no preflight, so every engine behaves the same. The prefix keeps
 * the "a missing stub fails loudly" property: the fixture's catch-all owns everything
 * under it, so a call the fixture does not know about gets a 501 from the stub rather
 * than an `index.html` from the preview server's SPA fallback — and nothing can reach
 * the real api.jhemery.xyz, because nothing is pointed at it.
 */
export const API_ORIGIN = `${BASE_URL}/__e2e-api`

/** The path prefix on its own — the fixture strips it before matching. */
export const API_PREFIX = '/__e2e-api'
