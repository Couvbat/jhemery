import { expect, test } from './fixtures'
import { saveFileLabels } from '@/content/privacy'

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
  await expect(page.getByRole('img', { name: saveFileLabels.qrAlt.en })).toBeVisible()

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
  await page.getByRole('button', { name: saveFileLabels.read.en }).click()
  await expect(page.getByRole('alert')).toHaveText(saveFileLabels.malformed.en)
  await expect(page.getByTestId('save-preview')).toHaveCount(0)
})

test('a link still being made when the choice changes is thrown away', async ({ page }) => {
  await page.goto('/privacy')
  await page.evaluate(() => window.localStorage.setItem('couvbat:history', JSON.stringify(['ls', 'secret plans'])))
  await page.getByRole('checkbox', { name: /shell/ }).check()
  // Hold the QR encoder back, so the link is still being made when the shell is unticked.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/assets\/qr-[^/]+\.js$/, async (route) => {
    await held
    await route.continue()
  })
  await page.getByTestId('save-make').click()
  await page.getByRole('checkbox', { name: /shell/ }).uncheck()
  const loaded = page.waitForResponse(/\/assets\/qr-[^/]+\.js$/)
  release()
  await loaded
  // Two frames: the module has run and the press's continuation with it.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  // Nothing from the first press is published; a fresh one leaves the history out.
  await expect(page.getByTestId('save-made')).toHaveCount(0)
  await page.getByTestId('save-make').click()
  const link = await page.getByTestId('save-link').inputValue()
  await page.goto('/now')
  await page.goto(link)
  await expect(page.getByTestId('save-preview')).not.toContainText('couvbat:history')
})

test('a restore the storage refuses says so and stays, rather than reloading', async ({ page }) => {
  await page.goto('/privacy')
  await page.evaluate(() => window.localStorage.setItem('couvbat:games:snake', '42'))
  await page.getByTestId('save-make').click()
  const link = await page.getByTestId('save-link').inputValue()
  await page.evaluate(() => window.localStorage.removeItem('couvbat:games:snake'))
  await page.goto('/now')
  await page.goto(link)
  await expect(page.getByTestId('save-preview')).toContainText('couvbat:games:snake')

  // A full quota, from here on.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
  })
  await page.getByTestId('save-restore').click()
  await expect(page.getByRole('alert')).toContainText('couldn’t be written')
  // Not on its way to a reload: a restore that took says "Restored" and disables the button.
  await expect(page.getByTestId('save-restore')).toBeEnabled()
  await expect(page.getByTestId('save-restore')).not.toContainText(saveFileLabels.restoring.en)
  await expect(page.getByTestId('save-preview')).toBeVisible()
})

test('shows every alias a save would restore in full', async ({ page }) => {
  await page.goto('/privacy')
  const long = `echo ${'x'.repeat(80)} && rm -rf ~`
  await page.evaluate((value) => window.localStorage.setItem('couvbat:aliases', JSON.stringify({ gl: 'git log', ll: value })), long)
  await page.getByRole('checkbox', { name: /shell/ }).check()
  await page.getByTestId('save-make').click()
  const link = await page.getByTestId('save-link').inputValue()
  await page.evaluate(() => window.localStorage.removeItem('couvbat:aliases'))
  await page.goto('/now')
  await page.goto(link)
  const aliases = page.getByTestId('save-alias')
  await expect(aliases).toHaveText(['gl → git log', `ll → ${long}`])
})
