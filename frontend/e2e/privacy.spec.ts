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
})
