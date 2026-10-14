import { expect, test } from './fixtures'
import { decisions } from '@/content/decisions'
import { work } from '@/content/work'
import { messages } from '@/i18n/messages'

/**
 * The palette's content search, where jsdom can't follow it: that the build emits
 * `/search.json` and the server hands it back as itself, that the palette leaves it
 * alone until a query is long enough to search with, and that a phone, which has no
 * Ctrl+K, reaches the palette from the navbar menu and lands on a case study. What
 * matches what, and where a result goes, is `lib/__tests__/search.spec.ts`'s.
 */

const qr = work.find((part) => part.id === 'qr')!
const polling = decisions.find((decision) => decision.id === 'polling')!

/** Every request for the index, from the moment the page starts loading. */
function indexRequests(page: import('@playwright/test').Page): string[] {
  const seen: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/search.json') seen.push(request.url())
  })
  return seen
}

test('the index is served as itself, not as the app', async ({ request }) => {
  const response = await request.get('/search.json')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/json/)
  const index = (await response.json()) as { version: number; entries: { target: string }[] }
  expect(index.version).toBe(1)
  expect(index.entries.map((entry) => entry.target)).toContain(`/work/${qr.id}`)
})

test('the palette fetches the index on the first long enough query, once, and runs a `why` from it', async ({
  page,
  terminal,
}) => {
  test.skip(test.info().project.name === 'mobile', 'Ctrl+K is a desktop’s; a phone’s `why` result is tap-shell.spec.ts’s.')
  const requests = indexRequests(page)

  await page.goto('/')
  // The launcher being there means the app has mounted, and with it the Ctrl+K listener.
  await expect(page.getByRole('button', { name: /open terminal/i })).toBeVisible()
  await page.keyboard.press('Control+k')
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()

  // Two characters search the palette's own commands, and nothing else.
  await input.pressSequentially('wh')
  await expect(page.getByRole('option', { name: /^why\b/ })).toBeVisible()
  expect(requests).toEqual([])

  await input.pressSequentially('y the guestbook')
  const result = page.getByRole('group', { name: messages.search.why.en }).getByRole('option', { name: new RegExp(polling.topic.en) })
  await expect(result).toBeVisible()
  await input.pressSequentially(' ticker')
  await expect(result).toBeVisible()
  expect(requests).toHaveLength(1)

  await result.click()
  // The palette fades out as the terminal opens; until it has gone there are two dialogs.
  await expect(page.getByRole('dialog', { name: messages.palette.open.en })).toBeHidden()
  await expect(terminal.panel).toBeVisible({ timeout: 15_000 })
  await terminal.expectOutput(`why ${polling.id}`)
  await terminal.expectOutput(polling.topic.en)
})

test('a phone opens the palette from the menu, and finds a case study', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'The menu is `lg:hidden`, and a desktop has Ctrl+K.')

  await page.goto('/')
  await page.getByRole('button', { name: messages.nav.toggleMenu.en }).click()
  await page.getByRole('button', { name: `$ ${messages.search.open.en}` }).click()

  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()
  // Under 16px, iOS zooms the whole page in when the input takes focus.
  expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')

  await input.pressSequentially('qr enc')
  const result = page.getByRole('group', { name: messages.search.work.en }).getByRole('option', { name: new RegExp(qr.name.en) })
  await result.click()

  await expect(page).toHaveURL(new RegExp(`/work/${qr.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: qr.name.en })).toBeVisible()
  await expect(page.getByRole('dialog', { name: messages.palette.open.en })).toBeHidden()
})
