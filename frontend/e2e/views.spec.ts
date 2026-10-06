import { expect, test } from './fixtures'
import { profile } from '@/content/profile'
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

/** The navbar's link to the tools page; the projects section's case studies mention tools too. */
const navToTools = (page: import('@playwright/test').Page) => page.getByRole('banner').getByRole('link', { name: /tools/ })

/** The one `role="status"` node a page change is announced in (`usePageFocus`). */
const announcement = (page: import('@playwright/test').Page) => page.getByTestId('page-announcement')
const toolsLabel = `${tools.heading.en} — ${profile.name}`

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
    await navToTools(page).click()

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
    // With a hash, the section's own heading takes focus, not the page's `<h1>`.
    await expect(page.locator('#contact h2')).toBeFocused()
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
    await navToTools(page).click()
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

/**
 * Accessible page changes (`usePageFocus`): what jsdom can't see is focus after a real
 * transition — the swing has to have finished, the leaving face has to be out of reach
 * for every frame of it, and the heading that takes focus is the arriving page's.
 */
test.describe('page changes, for a keyboard and a screen reader', () => {
  test('the new page’s heading takes focus once the turn is over, and the page is announced', async ({ page }) => {
    await page.goto('/')
    await openNav(page)
    await navToTools(page).click()

    await expect(page.locator('.view-stage')).toHaveClass(/is-swinging/)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeFocused()
    await expect(announcement(page)).toHaveText(toolsLabel)
  })

  test('leaves exactly one face within reach in every frame of the turn', async ({ page }) => {
    await page.goto('/')
    // Sampled on every frame from before the click to after the stage unfixes, because
    // an assertion could only ever look at one moment of it.
    await page.evaluate(() => {
      const w = window as unknown as { __faces: Array<[number, number]> }
      w.__faces = []
      const sample = () => {
        w.__faces.push([
          document.querySelectorAll('.view-stage main').length,
          document.querySelectorAll('.view-stage main:not([inert])').length,
        ])
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })

    await openNav(page)
    await navToTools(page).click()
    await expect(page.locator('.view-stage')).toHaveClass(/is-swinging/)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)

    const faces = await page.evaluate(() => (window as unknown as { __faces: Array<[number, number]> }).__faces)
    // Two `<main>`s did overlap, so the check below had something to catch…
    expect(Math.max(...faces.map(([all]) => all))).toBe(2)
    // …and in no frame could more, or fewer, than one be reached.
    expect(new Set(faces.map(([, reachable]) => reachable))).toEqual(new Set([1]))
  })

  test('the skip link is the first Tab, and lands on the heading without a hash', async ({ page }) => {
    await page.goto('/tools')

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: messages.nav.skip.en })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeFocused()
    await expect(page).toHaveURL(/\/tools$/)
  })

  // `cd` closes the terminal, so the page it goes to is the one the keyboard goes to.
  test('cd tools hands focus to the tools page, once it has turned', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')
    await page.goto('/')
    await terminal.open()
    await terminal.input.fill('cd tools')
    await terminal.input.press('Enter')

    await expect(terminal.panel).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeFocused()
  })

  // The guard: a page changing behind an open terminal (here, Back) leaves the keyboard
  // where the visitor is typing.
  test('a page change under the open terminal keeps focus in the terminal', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')
    await page.goto('/')
    await openNav(page)
    await navToTools(page).click()
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeFocused()

    await terminal.open()
    await page.goBack()
    await expect(page.locator('.view-stage')).toHaveClass(/is-swinging/)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)

    await expect(page).toHaveURL(/\/$/)
    await expect(terminal.input).toBeFocused()
  })

  // Found in review: previous/next between case studies turns no face, so focus stayed on
  // the link at the bottom of a page that had changed under it.
  test('next → on a case study moves focus to the next one’s heading', async ({ page }) => {
    await page.goto('/work/vim')
    await page.getByRole('link', { name: /next:/i }).click()
    await expect(page).toHaveURL(/\/work\/qr$/)
    await expect(page.getByRole('heading', { level: 1, name: /QR/ })).toBeFocused()
  })

  test('under reduced motion, the pages swap and focus still moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await openNav(page)
    await navToTools(page).click()

    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeFocused()
    await expect(announcement(page)).toHaveText(toolsLabel)
  })

  test('the 404 has an <h1>, and is announced as a missing page, not the home page', async ({ page }) => {
    await page.goto('/definitely-not-a-page')
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible()

    // Home and back again: an arrival at the 404 inside the app, as a stale link makes.
    await page.getByRole('button', { name: `$ ${messages.notFound.back.en}` }).click()
    await expect(page.locator('#about h1')).toBeFocused()
    await expect(announcement(page)).not.toHaveText('')
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeFocused()
    await expect(announcement(page)).toHaveText(`${messages.notFound.label.en} — ${profile.name}`)
  })
})

test.describe('the case studies', () => {
  test('one renders from a hard load at /work/<id>, and its try link reaches the tool', async ({ page, pageErrors }) => {
    await page.goto('/work/qr')
    await expect(page.getByRole('heading', { level: 1, name: /QR/ })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(`${messages.work.tryIt.en} → tools/qr`) }).click()
    await expect(page).toHaveURL(/\/tools\/qr$/)
    expect(pageErrors).toEqual([])
  })

  // The leaving face stays mounted for the whole turn; read from the app-wide route, it
  // re-rendered as "not found" the moment the router moved on.
  test('keeps its own part on the face turning away', async ({ page }) => {
    await page.goto('/work/qr')
    await page.evaluate((notFound) => {
      const w = window as unknown as { __flipped: boolean }
      w.__flipped = false
      new MutationObserver(() => {
        if (document.body.innerText.includes(notFound)) w.__flipped = true
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    }, messages.work.notFound.en)

    await openNav(page)
    await navToTools(page).click()
    await expect(page.getByRole('heading', { level: 1, name: heading() })).toBeVisible()
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)
    expect(await page.evaluate(() => (window as unknown as { __flipped: boolean }).__flipped)).toBe(false)
  })

  // Below md there is no terminal to read a `?run=` link, so none is offered.
  test('offers run links where there is a terminal', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')
    await page.goto('/work/wordlists')
    await expect(page.locator('a[href^="/?run="]').first()).toBeVisible()
  })

  test('names the command on a phone instead, and links the decisions’ notes', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'The phone layout.')
    await page.goto('/work/wordlists')
    await expect(page.locator('a[href^="/?run="]').first()).toBeHidden()
    await expect(page.getByText('wordle daily', { exact: true })).toBeVisible()
    await expect(page.locator('a[href^="/notes/"]:visible').first()).toBeVisible()
  })

  test('an unknown one lists the ones there are', async ({ page }) => {
    await page.goto('/work/nope')
    await expect(page.getByText(messages.work.notFound.en)).toBeVisible()
    await page.getByRole('link', { name: /vim/ }).click()
    await expect(page).toHaveURL(/\/work\/vim$/)
  })
})
