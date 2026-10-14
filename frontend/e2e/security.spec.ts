import { expect, test } from './fixtures'
import { profile } from '@/content/profile'
import { messages } from '@/i18n/messages'

/**
 * `/security` reached from the footer through the router, and `security.txt` served as
 * a file rather than the SPA shell. What the file says is `security.spec.ts`'s; that the
 * well-known path answers is Apache's, which `vite preview` doesn't run.
 */

const heading = messages.security.heading.en

test.describe('/security', () => {
  test('the footer reaches it, with the address to write to', async ({ page, pageErrors }) => {
    await page.goto('/')
    const link = page.locator('footer').getByRole('link', { name: '/security' })
    await link.scrollIntoViewIfNeeded()
    await link.click()

    await expect(page).toHaveURL(/\/security$/)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(`^${heading}`))
    await expect(page.getByTestId('security-contact')).toHaveAttribute('href', `mailto:${profile.email}`)
    expect(pageErrors).toEqual([])
  })

  test('security.txt is the file, with its contact and a future expiry', async ({ request }) => {
    const response = await request.get('/security.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/text\/plain/)
    const body = await response.text()
    expect(body).toContain(`Contact: mailto:${profile.email}`)
    const expires = /^Expires: (.+)$/m.exec(body)?.[1]
    expect(new Date(expires!).getTime()).toBeGreaterThan(Date.now())
  })
})
