import { test as base } from '@playwright/test'
import { ApiStub } from './api'
import { AppState } from './app'
import { enforceProductionCsp } from './csp'
import { Terminal } from './terminal'

export { expect } from '@playwright/test'
export type { ApiPreset, RecordedRequest } from './api'
export type { SeedState } from './app'

interface Fixtures {
  /** The stubbed backend. Starts on the `configured` preset; call `use()` to change it. */
  api: ApiStub
  /** Persisted state, seeded before first paint. Starts booted and in English. */
  app: AppState
  /** Keyboard-driven access to the terminal overlay. */
  terminal: Terminal
  /**
   * Uncaught exceptions from the page, in order. Recorded for every test whether or
   * not it asks for them, because the listener has to be attached before the first
   * navigation — by the time a test body could add one, the interesting throw has
   * already happened.
   */
  pageErrors: string[]
  /**
   * Opt-in: naming it runs the test under public/.htaccess's Content-Security-Policy,
   * and it holds whatever that policy refused. Needs `serviceWorkers: 'block'` — see
   * the fixture.
   */
  cspViolations: string[]
}

/**
 * The suite's `test`. Import from here rather than `@playwright/test` — the fixtures
 * install themselves during setup, which is what guarantees no test can accidentally
 * reach a real backend or inherit another test's localStorage.
 *
 * `api` and `app` are `auto` on purpose. A lazily-instantiated fixture only exists
 * once a test names it, which would mean a test that forgot to name `api` silently
 * ran against the network, and one that forgot `app` inherited whatever locale
 * `navigator.language` reports on the machine. Both have to be installed before the
 * first navigation, for every test, whether or not the test body mentions them.
 */
export const test = base.extend<Fixtures>({
  api: [
    async ({ page }, use) => {
      const stub = new ApiStub(page)
      await stub.install()
      stub.use('configured')
      await use(stub)
    },
    { auto: true },
  ],

  app: [
    async ({ page }, use) => {
      const state = new AppState(page)
      await state.install()
      await use(state)
    },
    { auto: true },
  ],

  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
    },
    { auto: true },
  ],

  // Not `auto`: the policy costs a round trip through `route.fetch()` per response,
  // and most specs are about something else. The service worker has to be off because
  // once it claims the page (`clientsClaim`) it answers navigations from its precache,
  // nothing reaches `page.route`, and the test passes because the header never arrived.
  cspViolations: async ({ page, serviceWorkers }, use) => {
    if (serviceWorkers !== 'block') {
      throw new Error("cspViolations needs test.use({ serviceWorkers: 'block' })")
    }
    await use(await enforceProductionCsp(page))
  },

  terminal: async ({ page }, use) => {
    await use(new Terminal(page))
  },
})
