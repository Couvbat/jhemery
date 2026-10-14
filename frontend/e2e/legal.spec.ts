import { expect, test } from './fixtures'
import { host } from '@/content/legal'
import { messages } from '@/i18n/messages'

/**
 * What the law asks the site to show, where jsdom can't follow: `/legal` reached from the
 * footer through the router, and the SoundCloud player, a third party's frame, staying off
 * the page until the visitor asks for it. Its origin is answered with an empty page, so
 * the suite never reaches SoundCloud even once asked.
 */

const STUB = '<!doctype html><title>stub</title>'

test.describe('/legal', () => {
  test('the footer reaches it, and it names the host', async ({ page, pageErrors }) => {
    await page.goto('/')
    const link = page.locator('footer').getByRole('link', { name: '/legal' })
    await link.scrollIntoViewIfNeeded()
    await link.click()

    const heading = messages.legal.heading.en
    await expect(page).toHaveURL(/\/legal$/)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(`^${heading}`))
    await expect(page.getByText(host.name)).toBeVisible()
    await expect(page.getByTestId('legal-credits').getByRole('link', { name: 'Open-Meteo.com' })).toBeVisible()
    expect(pageErrors).toEqual([])
  })
})

test.describe('the SoundCloud player', () => {
  test('loads nothing from SoundCloud until the button is pressed', async ({ page }) => {
    const asked: string[] = []
    await page.route('https://w.soundcloud.com/**', (route) => {
      asked.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'text/html', body: STUB })
    })
    await page.goto('/')

    const consent = page.getByTestId('music-consent')
    await consent.scrollIntoViewIfNeeded()
    await expect(consent).toContainText(messages.music.consent.en)
    await expect(page.locator('#music iframe')).toHaveCount(0)
    expect(asked).toEqual([])

    await consent.getByRole('button', { name: messages.music.load.en }).click()

    const frame = page.locator('#music iframe')
    await expect(frame).toHaveAttribute('src', /^https:\/\/w\.soundcloud\.com\/player\//)
    // The button went with the click, so focus follows the frame rather than falling to <body>.
    await expect(frame).toBeFocused()
    await expect.poll(() => asked.length).toBeGreaterThan(0)
  })
})
