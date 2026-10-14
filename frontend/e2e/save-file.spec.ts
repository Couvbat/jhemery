import { expect, test } from './fixtures'
import { messages } from '@/i18n/messages'

/**
 * The save file end to end, where jsdom can't follow: a real `CompressionStream`, the QR
 * drawn from the link, the code taken out of the address before the router reads it, and a
 * restore that ends in a real reload. What a code may carry is `save-file.spec.ts`'s.
 */

const local = (page: import('@playwright/test').Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key)

test('a save link carries progress to a browser without it, and writes nothing until restore', async ({ page, pageErrors }) => {
  await page.goto('/privacy')
  await page.evaluate(() => {
    window.localStorage.setItem('couvbat:theme', 'nord')
    window.localStorage.setItem('couvbat:games:snake', '42')
    window.sessionStorage.setItem('couvbat:sudo', 'hunter2')
  })

  await page.getByTestId('save-make').click()
  const link = await page.getByTestId('save-link').inputValue()
  expect(link).toMatch(/\/privacy#save=[A-Za-z0-9_-]+$/)
  await expect(page.getByRole('img', { name: messages.saveFile.qrAlt.en })).toBeVisible()

  // A browser that has none of it: what the fixture seeds before every load stays.
  await page.evaluate(() => {
    window.localStorage.removeItem('couvbat:theme')
    window.localStorage.removeItem('couvbat:games:snake')
    window.sessionStorage.clear()
  })
  // From another page, so the link is a load and not only a change of fragment.
  await page.goto('/now')
  await page.goto(link)

  await expect(page).toHaveURL(/\/privacy$/)
  const preview = page.getByTestId('save-preview')
  await expect(preview).toContainText('couvbat:theme')
  await expect(preview).toContainText('couvbat:games:snake')
  await expect(preview).not.toContainText('couvbat:sudo')
  expect(await local(page, 'couvbat:theme')).toBeNull()

  await Promise.all([page.waitForEvent('load'), page.getByTestId('save-restore').click()])
  expect(await local(page, 'couvbat:theme')).toBe('nord')
  expect(await local(page, 'couvbat:games:snake')).toBe('42')
  expect(await page.evaluate(() => window.sessionStorage.getItem('couvbat:sudo'))).toBeNull()
  expect(pageErrors).toEqual([])
})

test('a code that isn’t one says so, and writes nothing', async ({ page }) => {
  await page.goto('/privacy')
  await page.getByTestId('save-paste').fill('definitely-not-a-save')
  await page.getByRole('button', { name: messages.saveFile.read.en }).click()
  await expect(page.getByRole('alert')).toHaveText(messages.saveFile.malformed.en)
  await expect(page.getByTestId('save-preview')).toHaveCount(0)
})
