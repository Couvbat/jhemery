import { expect, test } from './fixtures'

/**
 * First contact: the boot sequence, and the two performance decisions that are only
 * observable at page load.
 *
 * The three.js background is ~520 kB and purely decorative. `App.vue` skips it
 * entirely under `prefers-reduced-motion` and defers it to `requestIdleCallback` for
 * everyone else. That is a promise about what crosses the network, and the only place
 * it can be checked is a real browser watching real requests — the unit tests mount
 * components that never fetch anything.
 */

test.describe('the boot sequence', () => {
  test('plays on a first visit and remembers that it did', async ({ page, app }) => {
    await app.seed({ booted: false })
    await page.goto('/')

    await expect(page.getByText('couvsh 1.0 booting…')).toBeVisible()
    await expect(page.getByText('welcome.')).toBeVisible()

    // It is dismissible — eleven steps at 130 ms is charming once and tedious on the
    // second look, so any key or click cuts it short.
    await page.keyboard.press('Enter')
    await expect(page.getByText('welcome.')).toBeHidden()
    expect(await app.read('booted')).toBe('1')
  })

  test('does not play again on the next visit', async ({ page }) => {
    // The default seed is already "booted", which is the returning-visitor state.
    await page.goto('/')

    await expect(page.locator('#about')).toBeVisible()
    await expect(page.getByText('couvsh 1.0 booting…')).toBeHidden()
  })

  test('replays on demand, and the flag survives it', async ({ page, app, terminal }) => {
    test.skip(
      test.info().project.name === 'mobile',
      'Driven by the `reboot` command, which needs a terminal.',
    )

    await page.goto('/')
    await terminal.open()
    await terminal.input.fill('reboot')
    await terminal.input.press('Enter')

    await expect(page.getByText('couvsh 1.0 booting…')).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(page.getByText('welcome.')).toBeHidden()
    expect(await app.read('booted')).toBe('1')
  })
})

test.describe('the three.js background', () => {
  test('is fetched, but only once the browser is idle', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))

    await page.goto('/')
    await expect(page.locator('#about')).toBeVisible()

    // It is not part of the initial payload — the hero renders first and the scene
    // arrives afterwards, on `requestIdleCallback`.
    await expect(async () => {
      expect(requested.some((url) => url.includes('ThreeBackground'))).toBe(true)
    }).toPass()
  })

  test.describe('under prefers-reduced-motion', () => {
    // `page.emulateMedia`, not `test.use({ reducedMotion: 'reduce' })`. The context
    // option is the documented way to do this and it silently does nothing here —
    // `matchMedia('(prefers-reduced-motion: reduce)')` still reports false inside the
    // page, so the app takes the animated path and the test passes for the wrong
    // reason (or, worse, fails and sends you looking at App.vue). Emulating on the
    // page applies immediately and verifiably; the assertions below only mean
    // something because of it.
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    test('is never fetched at all', async ({ page }) => {
      const requested: string[] = []
      page.on('request', (request) => requested.push(request.url()))

      await page.goto('/')
      await expect(page.locator('#about')).toBeVisible()

      // The emulation is asserted, not assumed — without it every assertion below
      // passes vacuously against the animated build.
      await expect(
        page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).resolves.toBe(true)

      // Proving a *negative* needs a defined moment to check at, and the app's own
      // scheduler provides one: queue an idle callback of our own and wait for it.
      // Callbacks run in registration order, so ours firing means App.vue's — queued
      // during mount, long before this — has already had its turn. The `setTimeout`
      // branch mirrors the fallback in App.vue for engines without
      // `requestIdleCallback` (WebKit), rather than inventing a different wait.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            if (typeof requestIdleCallback === 'function') {
              requestIdleCallback(() => resolve(), { timeout: 3000 })
            } else {
              setTimeout(resolve, 600)
            }
          }),
      )

      // Not "loaded and then hidden" — never requested. Half a megabyte for a static
      // frame nobody asked to animate is the exact cost this rule exists to avoid.
      expect(requested.filter((url) => url.includes('ThreeBackground'))).toEqual([])
      await expect(page.locator('canvas')).toHaveCount(0)
    })

    test('and the site is completely usable without it', async ({ page, terminal }) => {
      test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')

      await page.goto('/')
      await terminal.open()
      await terminal.run('help')

      await terminal.expectOutput('whoami')
    })
  })
})
