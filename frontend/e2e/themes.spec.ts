import { expect, test } from './fixtures'
import { messages } from '@/i18n/messages'
import { findTheme } from '@/lib/themes'

/**
 * Colour schemes. The command, the achievements and the token table are unit-tested;
 * what only a browser can show is that a scheme actually *paints*: that the inline
 * custom properties cascade through Tailwind's `@theme` into computed colours, that a
 * saved scheme is on screen once the app has mounted, and that the light-mode rules in
 * main.css apply.
 */

const gruvbox = findTheme('gruvbox')!
const latte = findTheme('catppuccin-latte')!
const dracula = findTheme('dracula')!

/** `#rrggbb` as the `rgb(r, g, b)` string `getComputedStyle` reports. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

test('a saved scheme is painted on load', async ({ page, app }) => {
  await app.seed({ theme: 'gruvbox' })
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'gruvbox')
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(gruvbox.colours.background))
  // `text-primary` is a Tailwind utility over `--color-primary` over `--primary` — the
  // whole chain has to resolve for this to be orange.
  await expect(page.locator('#about h1').first()).toHaveCSS('color', rgb(gruvbox.colours.primary))
})

test('a light scheme repaints the page and drops the glows', async ({ page, app, terminal }) => {
  test.skip(
    test.info().project.name === 'mobile',
    'Driven through `theme`, and a phone has no terminal: the launcher is `hidden md:flex`.',
  )

  await page.goto('/')
  await terminal.open()

  await terminal.run('theme catppuccin-latte')

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(latte.colours.background))
  await expect(page.locator('.glow-green').first()).toHaveCSS('text-shadow', 'none')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', latte.colours.background)
  expect(await app.read('theme')).toBe('catppuccin-latte')
})

test('the navbar menu switches scheme, on a phone too', async ({ page, app }) => {
  // No skip for `mobile`: this menu is the only way a phone has to change scheme,
  // since the terminal launcher is `hidden md:flex`. Desktop and phone each render
  // their own trigger and hide the other, so the role query finds the one on screen.
  await page.goto('/')

  await page.getByRole('button', { name: messages.nav.theme.en }).click()
  const latteItem = page.getByRole('menuitemradio', { name: latte.id })
  await latteItem.click()

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(latte.colours.background))
  // It stays open on a pick, as a live preview, with the tick moved.
  await expect(latteItem).toHaveAttribute('aria-checked', 'true')
  expect(await app.read('theme')).toBe(latte.id)
  expect(await app.readJson<string[]>('achievements')).toContain('flashbang')

  await page.keyboard.press('Escape')
  await expect(latteItem).toBeHidden()
})

/**
 * The circle a new scheme spreads in (`document.startViewTransition`). The unit spec pins
 * when it is asked for; what only a browser shows is that it actually runs, ends on the
 * new scheme, leaves no `::view-transition` overlay behind, and trips nothing under the
 * production CSP — the clip-path is animated from script, on a pseudo-element.
 */
test.describe('the theme circle', () => {
  test.use({ serviceWorkers: 'block' })

  test('a pick spreads, then leaves the page painted and nothing over it', async ({ page, browserName, cspViolations, pageErrors }) => {
    test.skip(browserName !== 'chromium', 'The other engines here take the instant repaint.')
    const consoleErrors: string[] = []
    // Errors the page's own code logs. A resource the offline stubs leave unanswered
    // (a third-party avatar, say) reports itself here too, and says nothing about this.
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        consoleErrors.push(`${message.text()} (${message.location().url})`)
      }
    })
    await page.addInitScript(() => {
      const start = document.startViewTransition?.bind(document)
      if (!start) return
      const counted = window as unknown as { __circles: number }
      counted.__circles = 0
      document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
        counted.__circles++
        return start(update)
      }) as typeof document.startViewTransition
    })
    await page.goto('/')

    await page.getByRole('button', { name: messages.nav.theme.en }).click()
    await page.getByRole('menuitemradio', { name: dracula.id }).click()

    await expect(page.locator('body')).toHaveCSS('background-color', rgb(dracula.colours.background))
    await expect(page.locator('html')).toHaveAttribute('data-theme', dracula.id)
    expect(await page.evaluate(() => (window as unknown as { __circles: number }).__circles)).toBe(1)
    // Over once it is over: no animation left on a transition pseudo-element, and no
    // transition active on the document.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const overlays = document
            .getAnimations()
            .filter((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition'))
          let active = false
          try {
            active = document.documentElement.matches(':active-view-transition')
          } catch {
            // An engine without the pseudo-class has nothing to report.
          }
          return overlays.length + Number(active)
        }),
      )
      .toBe(0)
    expect(cspViolations).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
})
