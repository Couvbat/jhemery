# Plan — Playwright end-to-end tests (frontend)

**Status:** implemented, 2026-08-08. 116 tests green across the `chromium` and `mobile`
projects. See "What changed against the plan" at the bottom.
**Scope:** `frontend/` only. The backend keeps its Jest `test:e2e` (supertest, in-process); this
adds browser-level coverage of the SPA.

## Why, and what it is *not* for

There are already ~1 800 unit assertions under `src/**/__tests__/` covering the terminal registry,
command behaviour, games, i18n and content purity — all in jsdom. What none of them can prove is
that the pieces assemble in a real browser: that the boot sequence clears, that the terminal
overlay's async chunk loads and takes keyboard focus, that a section anchor actually scrolls, that
the PWA manifest and `/resume.txt` are really served, that a backend outage degrades instead of
breaking the page.

So the rule for what belongs here: **if jsdom can already answer it, it stays in vitest.** Playwright
gets the things that need a real document, a real network layer, or a real service worker. Command
*logic* is not re-tested through the DOM; the terminal is exercised as a shell, not as a registry.

## Environment decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Where | `frontend/e2e/` | Sits beside the app it drives; `vitest.config.ts` only includes `src/**/__tests__/**`, so the two runners can't collide. |
| Server under test | `npm run preview` (built `dist/`, port 4173) via `webServer` | Production-shaped: minified bundle, real PWA service worker, real `dist/` static files. `dev` would test Vite's dev server instead of the artefact we ship. |
| Backend | **Never** the real API | Every `/steam`, `/github`, `/weather`, `/markets`, `/stats`, `/guestbook`, `/presence` call is stubbed with `page.route`. A test suite that goes red because `api.jhemery.xyz` is down is worthless. |
| `VITE_API_URL` | set to `http://127.0.0.1:4173/__e2e-api` for the e2e build | A same-origin prefix nothing else serves. *Planned* as a dead port; that turned out to be Chromium-only — see item 7 below. |
| Browsers | chromium + mobile; firefox and webkit behind `E2E_ALL_ENGINES` | Planned as three engines on CI. Neither of the other two could be validated — see item 7. `fullyParallel`, `retries: 2` and `forbidOnly` on CI as planned. |
| Viewports | one desktop project (1280×800) + one mobile project (Pixel 5) | The terminal launcher is `hidden md:flex` — desktop-only by design — and the navbar swaps to a burger menu. Both paths need covering. |

## Fixtures the suite needs

1. **`api` fixture** — installs `page.route('**/steam/activity', …)` etc. from a `fixtures/api.ts`
   module of canned payloads matching the interfaces in [api.ts](frontend/src/lib/api.ts). Three
   presets: `configured` (full data), `unconfigured` (`{ configured: false }` — the documented
   degraded state), `down` (route aborted). Also stubs `/presence` (SSE) and `POST /stats/session`.
2. **`app` fixture** — seeds `localStorage` via `addInitScript` *before* first paint, so tests can
   choose their entry state. The keys that matter, all read at module scope:
   `couvbat:booted`, `couvbat:locale`, `couvbat:crt`, `couvbat:achievements`,
   `couvbat:history`, `couvbat:aliases`, `couvbat:games:*`. Default: booted, `en`, no achievements
   — first-visit boot is a test of its own, not a tax on every other test.
3. **`terminal` helper** — `open()` (backtick), `run(cmd)` (type + Enter), `output()` (scrollback
   text), `expectLine(re)`. One place that knows the selectors, so a template change is one edit.

**Selectors:** the app currently has zero `data-testid`. Tests use accessible-name locators —
`getByRole('button', { name: … })`, `getByLabel('terminal-input')` — which is what the existing
`aria-label`s and the `<label for="terminal-input">` already support. Where a locator would
otherwise be a CSS-class chain (the scrollback pane, section shells) the plan adds a `data-testid`
to the component rather than coupling a test to Tailwind classes. Localised labels are resolved
through the same `messages.ts` the app uses, imported into the test — never hardcoded English.

## The specs

### 1. `boot.spec.ts` — first visit
- No `couvbat:booted` → the sequence plays, `welcome.` appears, a keypress dismisses it, the key is
  written. Second load → no sequence.
- `prefers-reduced-motion: reduce` → no three.js chunk is requested at all (assert via
  `page.on('request')` that nothing matching `three` is fetched) and the page is still fully usable.
  This is the perf contract from CLAUDE.md, and nothing currently tests it.

### 2. `navigation.spec.ts` — the six sections
- Every id in `sections.ts` has a heading rendered, in both locales (drive the data from the content
  module itself, so adding a section fails the test until it's wired).
- Navbar link → hash in URL → section in viewport. Mobile project: burger opens, same result.
- `/nonsense` → NotFoundView, not a blank SPA shell. Then a hard reload on that URL still renders
  (this is what the `.htaccess` rewrite exists for; on the preview server it proves the fallback).

### 3. `terminal.spec.ts` — the shell as a shell
- Backtick opens; the async chunk loads; focus lands in the input; Escape/✕ closes; backtick inside
  an input field does *not* open, Ctrl+` does.
- `help` lists commands; Tab completes a unique prefix; Tab on an ambiguous prefix lists candidates;
  ↑/↓ walk history and history survives a reload (`couvbat:history`).
- `cd projects` scrolls the real page — the terminal's `navigate` capability crossing into the DOM,
  which unit tests stub.
- Ctrl+C aborts a long-running command and returns the prompt (the `AbortSignal` contract).
- A command that throws still releases `capture()` — type into a game, throw, confirm the input is
  live again. This is the wedged-input bug the design notes call out.

### 4. `live-data.spec.ts` — graceful degradation
For each of steam / github / weather / markets / guestbook, three passes: `configured` renders the
data, `unconfigured` renders the documented empty state, `down` renders the empty state **and logs
no uncaught error** (assert on `page.on('pageerror')`). This is the single most valuable file here —
it's the invariant CLAUDE.md states most emphatically and the one nothing currently guards.

### 5. `forms.spec.ts` — contact + guestbook
- Contact: validation errors on empty/bad email before any request fires; a valid submit posts the
  expected JSON body (asserted on the intercepted request); a 429 renders the rate-limit message;
  a 500 renders the failure message. Never a real send.
- Guestbook `sign`: same shape through the terminal prompt flow, and an entry containing
  `<script>` renders as literal text — the no-HTML-in-`OutputLine` guarantee, verified in a real DOM
  where it actually matters.

### 6. `achievements.spec.ts`
- Unlocking one shows the toast and persists to `couvbat:achievements`.
- Seed 29 unlocked, trigger the 30th → `completionist` cascades and the palette repaints.
- Konami sequence → CRT mode on, persisted, survives reload.

### 7. `static-assets.spec.ts` — the things the SPA fallback must not swallow
`/resume.txt`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`: 200, correct
content-type, and *not* HTML. Plus: the résumé's content matches what `src/content/profile.ts`
declares, which is the whole point of generating it at build time.

### 8. ~~`a11y.spec.ts`~~ — dropped
Lighthouse already runs on every PR with an accessibility budget. A second, flakier check of the
same thing was not worth the maintenance.

## CI

Add a third job to `frontend-pr-check.yml`, parallel to `check` and `lighthouse`, mirroring the
Lighthouse job's shape:

```yaml
  e2e:
    name: Playwright
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: playwright-report, path: frontend/playwright-report, retention-days: 14 }
```

No `paths:` filter, for the reason the file already documents at length. `--with-deps` adds ~1 min;
cache `~/.cache/ms-playwright` keyed on the Playwright version if that becomes annoying. Reporter:
`html` + `github` locally/CI, `list` when `!process.env.CI`. Traces `on-first-retry`, screenshots
and video `retain-on-failure`.

## Package changes

```jsonc
// frontend/package.json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
},
"devDependencies": { "@playwright/test": "^1.x", "@axe-core/playwright": "^4.x" }
```

`test` stays `vitest run` — CI runs them as separate steps, and `npm test` should stay fast.
`eslint.config.ts` gets `e2e/**` added to the linted files with the Playwright plugin's flat config;
`.gitignore` gets `playwright-report/`, `test-results/`, `blob-report/`.

## Order of work

1. Scaffold: `@playwright/test`, `playwright.config.ts`, `webServer`, scripts, ignores, lint config,
   one smoke spec (home renders, six headings). Prove the harness before writing tests against it.
2. Fixtures (`api`, `app`, `terminal`) + `data-testid`s where an accessible name doesn't exist.
3. Specs in value order: `live-data` → `terminal` → `navigation` → `forms` → `boot` →
   `static-assets` → `achievements` → `a11y`.
4. CI job, once the suite is green locally on all three engines.

Steps 1–2 are one PR; 3–4 can be one more, or split per spec file. Branch off `dev`, PR into `dev`.

## Risks worth naming up front

- **Animation timing.** The boot sequence is 11 steps × 130 ms and the toast auto-dismisses.
  Assert on state (`localStorage`, visibility) with web-first assertions, never `waitForTimeout`.
- **three.js on `requestIdleCallback`.** Under load the canvas may not exist yet. Tests that don't
  care about it should run with reduced-motion forced, which skips it entirely — cheap and
  deterministic. Only the one boot test asserts on it.
- **The service worker.** A registered SW can serve a stale build between runs. Give each run a
  fresh context (Playwright's default) and, if it still bites, unregister in `addInitScript`.
- **SSE `/presence`.** `page.route` must fulfil it with a `text/event-stream` body that ends, or the
  page keeps a connection open and the test hangs on `networkidle` — so don't wait on `networkidle`.
- **Suite creep.** The temptation will be to re-test every terminal command through the browser.
  That's ~1 800 assertions' worth of duplication running 100× slower. Keep the browser suite to the
  integration seams listed above.

## What changed against the plan

Six things the plan did not predict. Each is commented at the site in the code; they are collected
here because each one cost a debugging round and would cost it again.

1. **`vite preview` binds IPv6 only.** With no `--host` it resolves `localhost` to `::1`, so
   polling `http://127.0.0.1:4173` never connects and the run dies at "Timed out waiting from
   config.webServer" with a perfectly healthy server sitting there. The config passes
   `--host 127.0.0.1` so `baseURL` and the readiness check agree.

2. **`test.use({ reducedMotion: 'reduce' })` silently does nothing here.** Inside the page,
   `matchMedia('(prefers-reduced-motion: reduce)')` still reported `false`, which means the
   reduced-motion assertions would have passed against the animated build — a green test proving
   nothing. `page.emulateMedia()` in a `beforeEach` works, and `boot.spec.ts` asserts the emulation
   took before asserting anything that depends on it.

3. **The live-data composables memoise.** `steam`, `weather` and `gitlog` share one module-level
   fetch with the page sections rather than each hitting the API. So the three states cannot be
   walked within one page — each needs its own load. `btc` is the deliberate exception. This
   reshaped half of `live-data.spec.ts`.

4. **Commands that navigate unmount the input.** `cd` and `ping` close the overlay on success, so
   the terminal helper's "wait for the shell to settle" has to accept *gone* as well as *enabled*,
   or every navigating command times out.

5. **Proving a negative needs a defined moment.** For "three.js was never requested", `networkidle`
   is both banned by the lint config and wrong. The suite queues its own `requestIdleCallback` and
   waits for that: callbacks run in registration order, so ours firing means `App.vue`'s already
   did.

6. **A real bug, found by test 11.** See below.

7. **The cross-engine plan did not survive contact.** Two independent walls, both found by
   actually running the engines rather than trusting the config:

   - **A dead-port API origin is a Chromium-only trick.** A cross-origin `POST` carrying
     `Content-Type: application/json` is not a simple request, so the browser sends a CORS
     preflight — and **Playwright cannot intercept preflights**. Chromium's interception sidesteps
     CORS entirely and everything passes; WebKit sends the `OPTIONS` to the real network, finds
     nothing on port 9999, and never sends the POST at all. The fixture sees no request and the
     test reports that the contact form is broken. Fixed properly by pointing `VITE_API_URL` at a
     **same-origin path prefix** (`/__e2e-api`), which has no preflight in any engine and still
     keeps "a missing stub fails loudly": the catch-all owns everything under the prefix.
   - **WebKit-on-Windows does not intercept POSTs at all**, even same-origin — not via
     `page.route`, not via `context.route`, with no service worker involved. `page.on('request')`
     watches the POST leave and the handler never fires. **Firefox does not launch on this machine
     at all** (`browserType.launch: spawn UNKNOWN`, every test, every retry).

   So the shipped matrix is the two projects that were actually validated end to end, and the other
   two are one env var away (`E2E_ALL_ENGINES=1`) for whoever can give them a green run. Putting an
   unvalidated engine into a *required* status check is how a merge queue gets wedged.

8. **Parallelism had to be capped, and the timeouts raised.** Every page load in this suite pulls a
   520 kB WebGL scene and starts rendering it. At one worker per core the run stopped being a test
   of the app and became a test of the CPU — assertions timing out at 30–50 s in specs that pass in
   two when given room, in a different set each run. `workers: '50%'` (2 on CI) with a 60 s test
   timeout and a 10 s assertion timeout is stable across repeated full runs. Forcing reduced motion
   suite-wide would have been the cheaper fix and was rejected: it changes behaviour in fifteen
   places, including the games and the boot sequence the specs actually assert on.

## The bug this suite found

**Ctrl+C cannot interrupt a command that holds no capture.**

While such a command runs (`ping`, or anything that awaits), the input is `:disabled`. A disabled
input cannot hold focus, so `document.activeElement` falls back to `<body>` — outside the panel
entirely. The Ctrl+C handler lives on the input's `keydown` and never fires; neither does the
panel's Escape handler. Clicking the scrollback does not help, because its click-to-refocus targets
the same disabled input. The `AbortController` and every `ctx.signal` check are correct and in
place; there is simply no reachable way for a visitor to pull the trigger. Confirmed directly in
the browser: `activeElement` is `BODY`, `#terminal-input` is `disabled`, and neither Ctrl+C nor
Escape produces any effect.

`terminal.spec.ts` encodes it as a `test.fail()` with the full reasoning. When it is fixed the test
starts passing and Playwright reports "expected to fail but passed", which is the signal to drop
the annotation.

The likely fix — not applied here, since this was a testing task — is `readonly` instead of
`disabled` while busy (which is already what a capture uses, and is exactly why Ctrl+C *does* work
during a game), or moving the interrupt handler up to the panel.
