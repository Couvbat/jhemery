import { expect, test } from './fixtures'
import { sections } from '@/content/sections'
import { views } from '@/content/views'
import { messages } from '@/i18n/messages'

/**
 * Getting around the page.
 *
 * The section list is imported rather than transcribed: `sections.ts` is the single
 * definition the navbar, the terminal's `ls`/`cd`/`pwd`, the command palette and every
 * section header all read from, so a seventh section that only half the site knows
 * about fails here rather than shipping.
 */

test.describe('sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  for (const locale of ['en', 'fr'] as const) {
    test(`every section renders its heading in ${locale}`, async ({ page, app }) => {
      await app.seed({ locale })
      await page.reload()

      for (const section of sections) {
        await expect(page.locator(`#${section.id}`)).toBeAttached()
      }

      // `about` is the hero: it carries the page's `h1` and its own copy rather than
      // a `SectionHeader`, so it has no localised heading to look for.
      for (const section of sections.filter((s) => s.id !== 'about')) {
        await expect(page.locator(`#${section.id}`)).toContainText(section.heading[locale])
      }
    })
  }

  test('a navbar link scrolls to its section', async ({ page }) => {
    // Desktop links are `hidden lg:flex`; on the mobile project the same ids are
    // reached through the burger menu, covered below.
    test.skip(test.info().project.name === 'mobile', 'Covered by the burger-menu test.')

    const contact = sections.find((s) => s.id === 'contact')!
    await page.getByRole('button', { name: `./${contact.label.en}` }).click()

    await expect(page.locator('#contact')).toBeInViewport()
  })

  test('the navbar fits its own bar, on one line', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'The burger bar is one line by construction.')

    // What this is really watching for: the bar grows a link for every section and
    // every view, and its container is capped at `max-w-5xl` — so the room never
    // exceeds 992px however wide the screen is. Once the links stop fitting, each one
    // breaks between its `./` and its label and the bar silently becomes two rows, or
    // the language and trophy buttons slide out past the edge. Nine destinations did
    // exactly that at the old `md` breakpoint.
    //
    // The measurement is against the nav's *own* content box, not the viewport: at a
    // desktop width the overflow spills into the centring margin and stays on screen,
    // so a viewport check passes while the bar is visibly broken.
    await page.goto('/')

    const fit = await page.evaluate(() => {
      const nav = document.querySelector('header nav')!
      const ul = nav.querySelector('ul')!
      const logo = nav.firstElementChild as HTMLElement
      const style = getComputedStyle(nav)
      // `li > div > button` is the scheme menu's trigger, which sits in a wrapper that
      // also holds the menu.
      const links = [...ul.querySelectorAll('li > a, li > button, li > div > button')] as HTMLElement[]
      return {
        room: nav.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        needed: Math.round(logo.getBoundingClientRect().width + ul.scrollWidth),
        tallestLink: Math.max(...links.map((l) => l.getBoundingClientRect().height)),
        links: links.length,
        headerHeight: document.querySelector('header')!.getBoundingClientRect().height,
      }
    })

    expect(fit.needed).toBeLessThanOrEqual(fit.room)
    // One line of 14px text sits well under this; two lines do not.
    expect(fit.tallestLink).toBeLessThan(32)
    expect(fit.headerHeight).toBeLessThan(72)
    // Every section, every view but home, plus the language, scheme and trophy buttons.
    expect(fit.links).toBe(sections.length + views.length - 1 + 3)
  })

  test('the burger menu reaches every section on a phone', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'The burger is `lg:hidden`.')

    await page.getByRole('button', { name: messages.nav.toggleMenu.en }).click()

    const contact = sections.find((s) => s.id === 'contact')!
    await page.getByRole('button', { name: `$ cd ./${contact.label.en}` }).click()

    await expect(page.locator('#contact')).toBeInViewport()
    // The menu closes behind you — a nav panel still covering the section you asked
    // for is not navigation.
    await expect(page.getByRole('button', { name: `$ cd ./${contact.label.en}` })).toBeHidden()
  })

  test('the language toggle switches the whole page', async ({ page, app }) => {
    const projects = sections.find((s) => s.id === 'projects')!

    await page.getByRole('button', { name: messages.nav.language.en }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(page.locator('#projects')).toContainText(projects.heading.fr)
    // And it is remembered, which is the half a unit test cannot see.
    expect(await app.read('locale')).toBe('fr')
  })
})

test.describe('unknown routes', () => {
  test('a bad path renders the 404 view, not a blank shell', async ({ page }) => {
    await page.goto('/definitely-not-a-page')

    await expect(page.getByText('404')).toBeVisible()
    // The path appears twice — once in the fake prompt, once in the shell error —
    // and both are the point: the view echoes what you actually asked for.
    await expect(page.getByText('/definitely-not-a-page')).toHaveCount(2)
    await expect(page.getByText('No such file or directory')).toBeVisible()
  })

  /**
   * The reason `public/.htaccess` exists. A deep link is not a client-side route
   * transition: the server has to answer `/definitely-not-a-page` with `index.html`
   * before Vue ever runs. `vite preview` does the same SPA fallback Apache is
   * configured for, so this exercises the shape of the production rewrite even though
   * it cannot exercise Apache itself.
   */
  test('and survives a hard reload on that URL', async ({ page }) => {
    await page.goto('/definitely-not-a-page')
    await page.reload()

    await expect(page.getByText('404')).toBeVisible()
  })

  test('the back button returns to a working home page', async ({ page }) => {
    await page.goto('/definitely-not-a-page')
    await page.getByRole('button', { name: new RegExp(messages.notFound.back.en, 'i') }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#about')).toBeVisible()
  })
})
