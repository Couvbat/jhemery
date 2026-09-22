import { expect, test } from './fixtures'
import { sections } from '@/content/sections'
import { profile } from '@/content/profile'
import { gaming } from '@/content/gaming'
import { steamConfigured } from './fixtures/payloads'

/**
 * The harness test. It exists to prove the plumbing — built bundle, preview server,
 * baseURL, the `@/` alias into `src/content/`, and each of the three fixtures — before
 * anything else is written against it. If this file fails, no other failure in `e2e/`
 * means anything.
 */
test.describe('smoke', () => {
  test('renders the home page with every section', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(new RegExp(profile.name, 'i'))

    // Driven off the content module rather than a hardcoded list: `sections.ts` is
    // the single source the navbar, the terminal's `cd` and every section header
    // read from, so a seventh section that nobody rendered fails here.
    for (const section of sections) {
      await expect(page.locator(`#${section.id}`)).toBeAttached()
    }
  })

  test('boots without console errors', async ({ page, api }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto('/')
    await expect(page.locator('#about')).toBeVisible()

    expect(errors).toEqual([])
    // Nothing reached the catch-all unanswered. A non-empty list here means the app
    // grew an endpoint the fixture does not know about, which would otherwise show up
    // much later as an unexplained 501 in some unrelated spec.
    expect(api.unstubbed).toEqual([])
  })
})

test.describe('fixtures', () => {
  test('the api stub feeds the page', async ({ page, api }) => {
    await page.goto('/')

    await expect(page.locator('#gaming')).toContainText(steamConfigured.profile!.name)
    await expect(page.locator('#gaming')).toContainText('Factorio')
    expect(api.sent('GET', '/steam/activity')).toHaveLength(1)
  })

  test('the unconfigured preset falls back to static content', async ({ page, api }) => {
    api.use('unconfigured')
    await page.goto('/')

    // The documented degraded state: no Steam key means no live activity, and the
    // section renders the hand-written game list instead of an error.
    await expect(page.locator('#gaming')).not.toContainText(steamConfigured.profile!.name)
    await expect(page.locator('#gaming')).toContainText(gaming.fallbackGames[0]!.name)
  })

  test('the app fixture seeds locale before first paint', async ({ page, app }) => {
    await app.seed({ locale: 'fr' })
    await page.goto('/')

    // `i18n/index.ts` picks its locale while the module evaluates, so this only
    // passes if the seed really landed before the first script ran.
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    expect(await app.read('locale')).toBe('fr')
  })

  test('the terminal helper opens a live prompt', async ({ page, terminal }) => {
    test.skip(
      test.info().project.name === 'mobile',
      'The launcher is `hidden md:flex` — there is deliberately no terminal on a phone.',
    )

    await page.goto('/')
    await terminal.open()
    await terminal.run('whoami')

    await terminal.expectOutput(profile.handle)
  })
})
