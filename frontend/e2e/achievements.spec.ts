import { expect, test } from './fixtures'
import { achievementList } from '@/terminal/achievements'
import { messages } from '@/i18n/messages'

/**
 * Thirty achievements, persisted in `localStorage`, with the thirtieth cascading off
 * the other twenty-nine.
 *
 * The unlock rules themselves are unit-tested. What is only true in a browser is that
 * the toast appears, that the state survives a reload, and that the cascade fires
 * from a real interaction rather than from a direct call to `unlock()`.
 */

const byId = (id: string) => achievementList.find((a) => a.id === id)!

/**
 * Catches the achievement toast, which dismisses itself after 3.5 seconds.
 *
 * The obvious `await expect(page.getByRole('status')).toContainText(…)` *after* the
 * trigger is a race with a stopwatch: on a loaded machine the toast can come and go
 * before the first poll, and the test fails claiming nothing was ever shown. Start
 * waiting **before** the trigger instead, and read the text off the handle — a
 * detached node still answers `textContent`, so even a toast that vanished the
 * instant after it appeared is caught.
 *
 * Usage is always: open the watcher, do the thing, then await.
 */
function watchForToast(page: import('@playwright/test').Page) {
  // The rule's advice — prefer a web-first locator assertion — is right everywhere
  // except here: an auto-retrying assertion cannot catch an element that has already
  // been removed, which is the exact case this helper exists for.
  // eslint-disable-next-line playwright/no-wait-for-selector
  const handle = page.waitForSelector('[role="status"]')
  return async () => (await (await handle).textContent()) ?? ''
}

/** Everything except the cascade target — the seed for the "last one" test. */
const ALL_BUT_COMPLETIONIST = achievementList
  .map((a) => a.id)
  .filter((id) => id !== 'completionist')

test.describe('unlocking', () => {
  test('the Konami code unlocks its achievement and turns on CRT mode', async ({ page, app }) => {
    await page.goto('/')
    const toast = watchForToast(page)

    for (const key of [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]) {
      await page.keyboard.press(key)
    }

    expect(await toast()).toContain(byId('konami').title.en)
    await expect(page.locator('html')).toHaveClass(/crt-overdrive/)

    expect(await app.readJson<string[]>('achievements')).toContain('konami')
    expect(await app.read('crt')).toBe('true')
  })

  test('and both survive a reload', async ({ page, app }) => {
    await app.seed({ achievements: ['konami'], crt: true })
    await page.goto('/')

    // `restoreCrt` runs on mount; the class is the only evidence it did.
    await expect(page.locator('html')).toHaveClass(/crt-overdrive/)

    await page.getByRole('button', { name: messages.achievements.open.en }).click()
    await expect(page.getByText(byId('konami').description.en)).toBeVisible()
  })

  test('an unearned achievement shows its hint, not its answer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: messages.achievements.open.en }).click()

    const locked = byId('konami')
    await expect(page.getByText(locked.hint.en)).toBeVisible()
    // The description gives the trick away, so it stays hidden until it is earned.
    await expect(page.getByText(locked.description.en)).toBeHidden()
  })
})

test.describe('the completionist cascade', () => {
  test('the twenty-ninth unlock brings the thirtieth with it', async ({ page, app }) => {
    // Everything but Konami, which is then earned for real below.
    await app.seed({
      achievements: ALL_BUT_COMPLETIONIST.filter((id) => id !== 'konami'),
    })
    await page.goto('/')

    for (const key of [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ]) {
      await page.keyboard.press(key)
    }

    // Two toasts are queued but shown one at a time — two floating notices fighting
    // for the same corner reads as a bug — so the persisted set is what to assert on.
    await expect
      .poll(async () => (await app.readJson<string[]>('achievements'))?.length)
      .toBe(achievementList.length)

    expect(await app.readJson<string[]>('achievements')).toContain('completionist')
  })

  test('does not fire while anything is still missing', async ({ page, app, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'Unlocked through the terminal.')

    // Two short of the set: earning one of them must not cascade.
    await app.seed({
      achievements: ALL_BUT_COMPLETIONIST.filter((id) => id !== 'konami' && id !== 'cowsay'),
    })
    await page.goto('/')

    await terminal.open()
    await terminal.run('cowsay hello')

    await expect
      .poll(async () => (await app.readJson<string[]>('achievements'))?.includes('cowsay'))
      .toBe(true)
    expect(await app.readJson<string[]>('achievements')).not.toContain('completionist')
  })
})

test.describe('the terminal route', () => {
  test.skip(
    () => test.info().project.name === 'mobile',
    'There is deliberately no terminal on a phone.',
  )

  test('a command unlock toasts and persists', async ({ page, app, terminal }) => {
    await page.goto('/')
    await terminal.open()

    const toast = watchForToast(page)
    await terminal.run('cowsay moo')

    expect(await toast()).toContain(byId('cowsay').title.en)
    await expect
      .poll(async () => (await app.readJson<string[]>('achievements'))?.includes('cowsay'))
      .toBe(true)
  })

  test('unlocking twice does not double up', async ({ app, terminal, page }) => {
    await page.goto('/')
    await terminal.open()
    await terminal.run('cowsay moo')
    await expect
      .poll(async () => (await app.readJson<string[]>('achievements'))?.includes('cowsay'))
      .toBe(true)

    await terminal.run('cowsay moo again')

    const stored = await app.readJson<string[]>('achievements')
    expect(stored!.filter((id) => id === 'cowsay')).toHaveLength(1)
  })
})
