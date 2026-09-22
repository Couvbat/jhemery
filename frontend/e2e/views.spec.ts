import { expect, test } from './fixtures'
import { views } from '@/content/views'
import { messages } from '@/i18n/messages'

/**
 * The second page, and the turn between pages.
 *
 * What jsdom cannot see: that `/tools` is a real route the SPA fallback serves on a
 * hard reload, that the navbar reaches it and the stage really turns (and stops
 * turning), that reduced motion really skips the turn, and that the terminal's `cd`
 * lands on a different URL. Everything about *which* way it turns, what `cd` accepts
 * and what `pwd` prints is decided in `useViewSwing.spec.ts` and the command specs.
 */

const tools = views.find((v) => v.id === 'tools')!
const heading = () => new RegExp(tools.heading.en.replace('&', '&'), 'i')

/** Opens the burger on a phone; on desktop the link is already visible. */
async function openNav(page: import('@playwright/test').Page) {
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: messages.nav.toggleMenu.en }).click()
  }
}

test.describe('the tools page', () => {
  test('renders at /tools and survives a hard reload', async ({ page, pageErrors }) => {
    await page.goto('/tools')
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeVisible()

    // The reason `public/.htaccess` forwards every path: a deep link is a server
    // request first, and the preview server does the same SPA fallback Apache does.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('opens a tool at its own URL and lists the rest', async ({ page }) => {
    await page.goto('/tools/json')

    await expect(page.getByRole('region', { name: /json/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /image converter/i })).toBeVisible()
    await expect(page).toHaveTitle(/json/i)
  })

  test('says so for a tool that does not exist', async ({ page }) => {
    await page.goto('/tools/nope')
    await expect(page.getByText('No such file or directory')).toBeVisible()
  })
})

test.describe('the prism', () => {
  test('the navbar turns to the tools page, then back', async ({ page, pageErrors }) => {
    await page.goto('/')
    await openNav(page)
    await page.getByRole('link', { name: /tools/ }).click()

    // The stage is only `.is-swinging` while it turns — it has to appear, and it has
    // to go away, or the pages would stay fixed and unclickable.
    await expect(page.locator('.view-stage')).toHaveClass(/is-swinging/)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)
    await expect(page).toHaveURL(/\/tools$/)
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#about')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('a section link from the tools page lands on that section', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Covered by the burger on the home page.')
    await page.goto('/tools')

    await page.getByRole('button', { name: './contact' }).click()

    await expect(page).toHaveURL(/\/#contact$/)
    await expect(page.locator('#contact')).toBeInViewport()
  })

  test('never turns under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    // A flag set the moment the stage is ever marked as swinging, because by the
    // time an assertion could look, a swing that did happen would already be over.
    await page.evaluate(() => {
      const stage = document.querySelector('.view-stage')!
      const w = window as unknown as { __swung: boolean }
      w.__swung = false
      new MutationObserver(() => {
        if (stage.classList.contains('is-swinging')) w.__swung = true
      }).observe(stage, { attributes: true, attributeFilter: ['class'] })
    })

    await openNav(page)
    await page.getByRole('link', { name: /tools/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeVisible()

    expect(await page.evaluate(() => (window as unknown as { __swung: boolean }).__swung)).toBe(
      false,
    )
  })

  test('cd tools from the terminal changes the page', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')
    await page.goto('/')
    await terminal.open()
    await terminal.run('cd tools/hash')

    await expect(page).toHaveURL(/\/tools\/hash$/)
    await expect(page.getByRole('region', { name: /hash/i })).toBeVisible()
  })
})
