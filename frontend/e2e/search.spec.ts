import { expect, test } from './fixtures'
import { decisions } from '@/content/decisions'
import { work } from '@/content/work'
import { messages } from '@/i18n/messages'

/**
 * The palette's content search, where jsdom can't follow it: that the build emits
 * `/search.json` and the server hands it back as itself, that the palette leaves it
 * alone until a query is long enough to search with, and that a phone, which has no
 * Ctrl+K, reaches the palette from the navbar menu and lands on a case study. Then three
 * things only a browser does: where focus goes once the menu that opened the palette
 * has gone, the input events a composing keyboard sends, and a chunk of the palette's
 * that is slow or never comes. What matches what, and where a result goes, is
 * `lib/__tests__/search.spec.ts`'s.
 */

const qr = work.find((part) => part.id === 'qr')!
const polling = decisions.find((decision) => decision.id === 'polling')!

const INDEX = /^\/search\.json$/
/** `lib/search.ts`'s own chunk. */
const SCORER = /^\/assets\/search-[\w-]+\.js$/

/** Every request for a path that `matches`, from the moment the page starts loading. */
function requestsFor(page: import('@playwright/test').Page, matches: RegExp): string[] {
  const seen: string[] = []
  page.on('request', (request) => {
    if (matches.test(new URL(request.url()).pathname)) seen.push(request.url())
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
  const requests = requestsFor(page, INDEX)
  const scorer = requestsFor(page, SCORER)

  await page.goto('/')
  // The launcher being there means the app has mounted, and with it the Ctrl+K listener.
  await expect(page.getByRole('button', { name: /open terminal/i })).toBeVisible()
  // The scorer is no part of the first paint: the first open asks for it.
  expect(scorer).toEqual([])
  await page.keyboard.press('Control+k')
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()

  // Two characters search the palette's own commands, and nothing else.
  await input.pressSequentially('wh')
  await expect(page.getByRole('option', { name: /^why\b/ })).toBeVisible()
  expect(requests).toEqual([])
  await expect.poll(() => scorer.length).toBe(1)

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

// The menu closes as the palette opens, and takes the button that opened it with it, so
// there was nothing left to give focus back to and it fell to <body>.
test('closing the palette opened from the menu gives focus back to the menu’s toggle', async ({ page }) => {
  // A keyboard below `lg`, where the menu is: a tablet's, or a narrow window's.
  await page.setViewportSize({ width: 900, height: 800 })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: messages.nav.toggleMenu.en })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: `$ ${messages.search.open.en}` }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: messages.palette.open.en })).toBeHidden()
  await expect(toggle).toBeFocused()
})

// An Android keyboard composes a Latin word as it is typed, as an IME composes CJK, and
// `v-model` waits for the composition to end: the list sat still until the word was done.
test('a phone searches a word while its keyboard is still composing it', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'The composition is driven over CDP, on the phone it happens on.')
  const requests = requestsFor(page, INDEX)

  await page.goto('/')
  await page.getByRole('button', { name: messages.nav.toggleMenu.en }).click()
  await page.getByRole('button', { name: `$ ${messages.search.open.en}` }).click()
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()

  const cdp = await page.context().newCDPSession(page)
  for (const text of ['e', 'en', 'enc', 'enco', 'encod']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
  }
  await expect(input).toHaveValue('encod')
  await expect(page.getByRole('group', { name: messages.search.work.en }).getByRole('option', { name: new RegExp(qr.name.en) })).toBeVisible()
  await expect(page.getByRole('option', { name: /^cd /i })).toHaveCount(0)
  expect(requests).toHaveLength(1)
})

/**
 * The scorer and the registry come by `import()` on the first open, and a chunk can fail
 * to: offline before the precache has it, in a window that runs no service worker, or
 * asked for by a tab older than the deploy that removed it. A scorer that hadn't come
 * left the palette saying *Nothing matches*, for good once it had failed, and a failed
 * chunk threw past the palette.
 */
test.describe('the palette’s own chunks', () => {
  // So the requests reach the route, as they do in a window that runs no service worker.
  test.use({ serviceWorkers: 'block' })

  test('a scorer on its way says so, one that never came says so on every open, and neither throws', async ({
    page,
    pageErrors,
  }) => {
    test.skip(test.info().project.name === 'mobile', 'Ctrl+K is a desktop’s, and the chunks are the same on a phone.')
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    // `tap` rather than the terminal's `registry`, whose chunk name the tools' eager one
    // shares: the palette asks for the two together, and either failing loses both.
    await page.route(/\/assets\/(search|tap)-[\w-]+\.js$/, async (route) => {
      if (SCORER.test(new URL(route.request().url()).pathname)) await held
      await route.abort()
    })

    await page.goto('/')
    await expect(page.getByRole('button', { name: /open terminal/i })).toBeVisible()
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox')
    await expect(input).toBeFocused()
    const list = page.getByRole('listbox')

    // The substring stand-in finds nothing for this, which isn't the scorer's answer.
    await input.pressSequentially('qr enc')
    await expect(list).toContainText(messages.search.loading.en)
    release()
    await expect(list).toContainText(messages.search.failed.en)
    await input.fill('wh')
    await expect(page.getByRole('option', { name: /^why\b/ })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await input.pressSequentially('qr enc')
    await expect(list).toContainText(messages.search.failed.en)
    expect(pageErrors).toEqual([])
  })
})
