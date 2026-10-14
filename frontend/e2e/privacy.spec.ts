import { expect, test } from './fixtures'
import { messages } from '@/i18n/messages'

/**
 * `/privacy`, where jsdom can't follow: the footer reaching it through the router on a real
 * viewport, a phone's included, the browser's own `navigator.storage.estimate()`, and a clear
 * that ends in a real reload. Which keys exist, what `du` prints and what `rm` removes are
 * decided in `storage-keys.spec.ts` and `storage-commands.spec.ts`.
 */

const heading = messages.privacy.heading.en

test.describe('/privacy', () => {
  test('the footer reaches it, and it reports what the browser counts', async ({ page, pageErrors }) => {
    await page.goto('/')
    const link = page.locator('footer').getByRole('link', { name: '/privacy' })
    await link.scrollIntoViewIfNeeded()
    await link.click()

    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(`^${heading}`))
    // A real StorageManager, which jsdom doesn't have.
    await expect(page.getByTestId('storage-estimate')).toContainText(/\d+(\.\d+)? (B|kB|MB|GB)/)
    // Seeded by the fixture before the first script ran.
    await expect(page.getByTestId('privacy-group-settings').getByText('couvbat:locale')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('clears a group in two presses on two buttons, then reloads', async ({ page }) => {
    await page.goto('/privacy')
    await page.evaluate(() => localStorage.setItem('couvbat:games:snake', '12'))
    await page.reload()

    const scores = page.getByTestId('privacy-group-scores')
    await expect(scores.locator('li', { hasText: 'couvbat:games:snake' })).toContainText('2 B')
    const first = scores.getByRole('button').first()
    await expect(first).toHaveText(/clear best scores/)
    await first.click()
    // Armed, the same button is Cancel: pressing it twice never clears anything.
    await expect(first).toHaveText(/cancel/)
    await first.click()
    await expect(scores.getByRole('button')).toHaveCount(1)
    expect(await page.evaluate(() => localStorage.getItem('couvbat:games:snake'))).toBe('12')

    await first.click()
    await page.evaluate(() => ((window as unknown as { __before: boolean }).__before = true))
    await scores.getByRole('button', { name: 'yes, clear 1 and reload' }).click()

    // The marker going is the reload: a fresh document, built from what storage now holds.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __before?: boolean }).__before ?? null)).toBeNull()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('couvbat:games:snake'))).toBeNull()
    const after = page.getByTestId('privacy-group-scores')
    await expect(after.locator('li', { hasText: 'couvbat:games:snake' })).toContainText(messages.privacy.notSet.en)
    await expect(after.getByRole('button').first()).toBeDisabled()
  })

  // The navbar sits on the page and writes: a scheme picked there is a row, and the group's
  // clear takes it. The fixture's seeded `booted` and `locale` come back with the reload.
  test('follows a key the navbar makes, and clears it with its group', async ({ page }) => {
    await page.goto('/privacy')
    const settings = page.getByTestId('privacy-group-settings')
    const theme = settings.locator('li', { has: page.getByText('couvbat:theme', { exact: true }) })
    await expect(theme).toContainText(messages.privacy.notSet.en)

    await page.getByRole('button', { name: messages.nav.theme.en }).click()
    await page.getByRole('menuitemradio', { name: 'dracula' }).click()
    await page.keyboard.press('Escape')
    await expect(theme).toContainText('7 B')

    await settings.getByRole('button').first().click()
    await page.evaluate(() => ((window as unknown as { __before: boolean }).__before = true))
    await settings.getByRole('button', { name: 'yes, clear 3 and reload' }).click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { __before?: boolean }).__before ?? null)).toBeNull()
    await expect(theme).toContainText(messages.privacy.notSet.en)
    expect(await page.evaluate(() => localStorage.getItem('couvbat:theme'))).toBeNull()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dracula')
  })

  test('a stale key is a group of its own, and Escape disarms it without dropping focus', async ({ page }) => {
    await page.goto('/privacy')
    await page.evaluate(() => localStorage.setItem('couvbat:retired', 'old'))
    await page.reload()

    const stale = page.getByTestId('privacy-group-stale')
    await expect(stale.getByRole('heading')).toHaveText('### leftovers from an older version')
    const own = stale.getByRole('button').first()
    await expect(own).toHaveText('clear leftovers from an older version')

    await own.focus()
    await page.keyboard.press('Enter')
    await expect(own).toHaveText(messages.privacy.cancel.en)
    await page.keyboard.press('Tab')
    await expect(stale.getByRole('button', { name: 'yes, clear 1 and reload' })).toBeFocused()
    // The confirm goes, and focus with it would fall to <body>: it lands on the group's button.
    await page.keyboard.press('Escape')
    await expect(stale.getByRole('button')).toHaveCount(1)
    await expect(own).toBeFocused()
    expect(await page.evaluate(() => localStorage.getItem('couvbat:retired'))).toBe('old')
  })
})
