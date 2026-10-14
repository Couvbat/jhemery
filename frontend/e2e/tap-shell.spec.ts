import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import type { ApiStub } from './fixtures/api'
import { decisions } from '@/content/decisions'
import { messages } from '@/i18n/messages'
import { guestbookConfigured } from './fixtures/payloads'

/**
 * The terminal's touch layout, below `md` (features-spec §9), where jsdom can't follow:
 * the breakpoint is a real viewport's, a phone's keyboard opens for a real input taking
 * focus, and scrolling sideways is real layout. Which buttons there are, and what the
 * shell does with a tap, is `terminal/__tests__/tap.spec.ts` and
 * `composables/__tests__/tapShell.spec.ts`.
 */

const polling = decisions.find((decision) => decision.id === 'polling')!

const panel = (page: Page) => page.getByRole('dialog', { name: messages.terminal.title.en })
const output = (page: Page) => page.getByTestId('terminal-output')
const buttons = (page: Page) => page.getByRole('navigation', { name: messages.tapShell.commands.en })
const stop = (page: Page) => page.getByRole('button', { name: messages.tapShell.stopLabel.en })

/** The overlay's chunk is the whole registry: the one wait in the suite allowed to be long. */
async function opened(page: Page) {
  await expect(panel(page)).toBeVisible({ timeout: 15_000 })
}

test.describe('the tap shell', () => {
  test.skip(() => test.info().project.name !== 'mobile', 'Below md: from md up the terminal has its prompt.')
  // The narrowest phone the layout is held to, under the Pixel 5's 393px.
  test.use({ viewport: { width: 375, height: 667 } })

  test('runs ?run=tour in the touch layout, drops the parameter, and stops it', async ({ page }) => {
    await page.goto('/?run=tour')
    await opened(page)
    await expect(page).not.toHaveURL(/run=/)
    await expect(output(page)).toContainText('This is a shell')
    // The touch layout has nothing to type into, so nothing to open a keyboard for.
    await expect(panel(page).locator('input, textarea, [contenteditable]')).toHaveCount(0)

    await stop(page).click()
    await expect(output(page)).toContainText(messages.terminal.cancelled.en)
    await expect(stop(page)).toBeHidden()
  })

  test('opens from the launcher, runs a tap, opens a command’s own row, and closes on Escape', async ({ page }) => {
    await page.goto('/')
    const launcher = page.getByRole('button', { name: messages.terminal.open.en })
    await launcher.click()
    await opened(page)
    await expect(output(page)).toContainText(messages.tapShell.hint.en)

    await buttons(page).getByRole('button', { name: 'neofetch', exact: true }).click()
    await expect(output(page)).toContainText('OS: Portfolio')

    // A command with arguments opens a row of its lines; the arrow comes back.
    await buttons(page).getByRole('button', { name: /^hardware, \d+ choices$/ }).click()
    await buttons(page).getByRole('button', { name: 'hardware nas', exact: true }).click()
    await expect(output(page)).toContainText('hardware nas')
    await buttons(page).getByRole('button', { name: messages.tapShell.back.en }).click()
    await expect(buttons(page).getByRole('button', { name: 'neofetch', exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(launcher).toBeVisible()
  })

  test('fits a phone: no sideways scroll, 44px targets, 16px gutters', async ({ page }) => {
    await page.goto('/')
    const launcher = page.getByRole('button', { name: messages.terminal.open.en })
    expect((await launcher.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await launcher.click()
    await opened(page)

    const width = page.viewportSize()!.width
    const box = (await panel(page).boundingBox())!
    expect(box.x).toBe(16)
    expect(box.x + box.width).toBe(width - 16)

    const close = (await page.getByRole('button', { name: messages.terminal.close.en }).boundingBox())!
    expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44)
    for (const target of await buttons(page).getByRole('button').all()) {
      expect((await target.boundingBox())!.height, (await target.textContent()) ?? '').toBeGreaterThanOrEqual(44)
    }

    // The row scrolls inside itself; the page never does.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const row = page.getByTestId('tap-row')
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  })

  test('the palette lists what a tap can run, and runs it there', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: messages.nav.toggleMenu.en }).click()
    await page.getByRole('button', { name: `$ ${messages.search.open.en}` }).click()
    const input = page.getByRole('combobox')

    // `play` would start a game, and a phone has no keys for one.
    await input.pressSequentially('play')
    await expect(page.getByRole('option', { name: /^play\b/ })).toHaveCount(0)
    await input.fill('')

    await input.pressSequentially('why the guestbook ticker')
    await page.getByRole('group', { name: messages.search.why.en }).getByRole('option', { name: new RegExp(polling.topic.en) }).click()
    await opened(page)
    await expect(output(page)).toContainText(`why ${polling.id}`)
    await expect(output(page)).toContainText(polling.topic.en)
  })

  // The toast runs `guestbook` the way a link would, so a phone gets the touch layout.
  test('the guestbook toast opens the touch layout, not a prompt', async ({ page, api, app }) => {
    // The ticker polls every 20 s, so the clock is the test's. Paused motion keeps three.js,
    // and its frames, out of the time that runs.
    await app.seed({ motion: 'paused' })
    await page.clock.install()
    const seeded = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/guestbook'))
    await page.goto('/')
    await seeded
    signed(api)
    await page.clock.runFor(21_000)

    await page.getByRole('button', { name: /grace/ }).click()
    await opened(page)
    await expect(output(page)).toContainText('grace')
    await expect(panel(page).locator('input')).toHaveCount(0)
  })
})

/** Someone signs while the page is open: the next poll finds an entry the first one didn't. */
function signed(api: ApiStub) {
  api.get('/guestbook', {
    ...guestbookConfigured,
    entries: [{ id: 'entry-3', name: 'grace', message: 'hi from a phone', date: '2026-10-14T10:00:00.000Z' }, ...guestbookConfigured.entries!],
  })
}
