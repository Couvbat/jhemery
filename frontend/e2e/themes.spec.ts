import { expect, test } from './fixtures'
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
