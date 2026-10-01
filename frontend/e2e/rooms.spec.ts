import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import type { ApiStub } from './fixtures/api'

/**
 * What jsdom cannot see about the rooms: that `/watch` and `/radio` are real routes
 * the SPA fallback serves, that a room code in the URL opens a held event stream and
 * turns its first frame into a player, and that the pages say so when the feature is
 * off. The player is an iframe on a third-party origin, so that origin is answered
 * with an empty page here — this suite never reaches the network, YouTube included.
 */

const ROOM = {
  code: 'AB3DE',
  kind: 'watch' as const,
  state: { media: 'aqz-KE-bpKQ', position: 42, playing: true, at: Date.now() },
  queue: ['zyxwvutsrq9'],
  members: 3,
}

const STUB = '<!doctype html><title>stub</title>'
const TRACK = 'https://soundcloud.com/couvbat/abysses'

test.beforeEach(async ({ page }) => {
  await page.route('**/*.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: STUB }),
  )
  await page.route('https://w.soundcloud.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: STUB }),
  )
})

test.describe('rooms', () => {
  test('the lobby says so when rooms are off', async ({ page, api, pageErrors }) => {
    api.use('unconfigured')
    await page.goto('/watch')

    await expect(page.getByRole('heading', { level: 1, name: /watch party/i })).toBeVisible()
    await expect(page.getByText(/rooms are off/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /start a room/i })).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })

  test('a guest joins by URL, survives a hard reload, and gets the host’s video', async ({
    page,
    api,
    pageErrors,
  }) => {
    api.room(ROOM)
    await page.goto('/watch/ab3de')

    const region = page.getByRole('region', { name: /watch party AB3DE/i })
    await expect(region).toBeVisible()
    await expect(region.getByText('AB3DE')).toBeVisible()
    await expect(region.getByText(/3 here/)).toBeVisible()
    // The first frame of the stream becomes the player: the host's video, without
    // controls, because the host drives.
    const frame = region.locator('iframe')
    await expect(frame).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/)
    await expect(frame).toHaveAttribute('src', /controls=0/)
    await expect(region.getByText('zyxwvutsrq9')).toBeVisible()
    // No token in this tab, so no host controls.
    await expect(region.getByRole('button', { name: /play now/i })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('region', { name: /watch party AB3DE/i }).locator('iframe')).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('the host starts a room from the lobby and lands in it with the controls', async ({
    page,
    api,
  }) => {
    api.room({ ...ROOM, state: { media: null, position: 0, playing: false, at: Date.now() }, queue: [], members: 1 })
    await page.goto('/watch')

    await page.getByRole('button', { name: /start a room/i }).click()

    await expect(page).toHaveURL(/\/watch\/AB3DE$/)
    const region = page.getByRole('region', { name: /watch party AB3DE/i })
    await expect(region.getByText(/^host$/i)).toBeVisible()
    await expect(region.getByRole('button', { name: /play now/i })).toBeVisible()
    expect(api.sent('POST', '/rooms').map((r) => r.body)).toEqual([{ kind: 'watch' }])
  })

  test('the radio lobby joins by code, in any case', async ({ page, api }) => {
    api.room({ ...ROOM, kind: 'radio', state: { media: null, position: 0, playing: false, at: Date.now() }, queue: [] })
    await page.goto('/radio')

    await page.getByRole('textbox', { name: /code or link/i }).fill('ab3de')
    await page.getByRole('button', { name: /^join$/i }).click()

    await expect(page).toHaveURL(/\/radio\/AB3DE$/)
    await expect(page.getByRole('region', { name: /radio AB3DE/i }).getByText(/waiting for the host/i)).toBeVisible()
  })

  test.describe('the up-next sidebar, as a guest', () => {
    /** The player and the sidebar, once the stream has filled both. */
    async function layout(page: Page, api: ApiStub) {
      api.room(ROOM)
      await page.goto('/watch/AB3DE')
      const region = page.getByRole('region', { name: /watch party AB3DE/i })
      const frame = region.locator('iframe')
      const aside = region.getByRole('complementary', { name: /up next/i })
      await expect(frame).toBeVisible()
      await expect(aside.getByRole('listitem')).toHaveText([/zyxwvutsrq9/])
      await expect(aside.getByText(/now playing/i)).toBeVisible()
      // No token in this tab: no next, no reorder, no remove.
      await expect(aside.getByRole('button')).toHaveCount(0)
      return { player: (await frame.boundingBox())!, side: (await aside.boundingBox())! }
    }

    test('sits right of the player on a wide screen', async ({ page, api, pageErrors }) => {
      test.skip(test.info().project.name === 'mobile', 'Two columns start at lg.')
      const { player, side } = await layout(page, api)
      expect(side.x).toBeGreaterThanOrEqual(player.x + player.width)
      expect(side.y).toBeLessThan(player.y + player.height)
      expect(pageErrors).toEqual([])
    })

    test('stacks under the player on a phone', async ({ page, api, pageErrors }) => {
      test.skip(test.info().project.name !== 'mobile', 'One column below lg.')
      const { player, side } = await layout(page, api)
      expect(side.y).toBeGreaterThanOrEqual(player.y + player.height)
      expect(pageErrors).toEqual([])
    })
  })

  test('the host reorders and removes from the sidebar, each button naming its item', async ({ page, api }) => {
    const [a, b, c] = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']
    const button = (verb: string, item: string, tail = '') => new RegExp(`^${verb} .*${item}${tail}$`, 'i')
    api.room({ ...ROOM, state: { media: null, position: 0, playing: false, at: Date.now() }, queue: [a, b, c], members: 1 })
    await page.goto('/watch')
    await page.getByRole('button', { name: /start a room/i }).click()

    const aside = page.getByRole('complementary', { name: /up next/i })
    await expect(aside.getByRole('button', { name: button('move', a, ' up') })).toHaveAttribute('aria-disabled', 'true')
    await aside.getByRole('button', { name: button('move', b, ' up') }).click()
    await expect(aside.getByRole('listitem')).toHaveText([new RegExp(b), new RegExp(a), new RegExp(c)])
    // Focus follows the item, so a keyboard user's next press acts on the same one.
    await expect(aside.getByRole('button', { name: button('move', b, ' up') })).toBeFocused()

    await aside.getByRole('button', { name: button('remove', c) }).click()
    await expect(aside.getByRole('listitem')).toHaveText([new RegExp(b), new RegExp(a)])
    expect(api.sent('POST', '/rooms/AB3DE/state').map((r) => r.body)).toEqual([{ queue: [b, a, c] }, { queue: [b, a] }])
  })

  test.describe('YouTube in radio', () => {
    test('a video in the queue plays in a small player that is still at least 200 px high', async ({
      page,
      api,
      pageErrors,
    }) => {
      api.room({ ...ROOM, kind: 'radio', queue: [TRACK] })
      await page.goto('/radio/AB3DE')

      const region = page.getByRole('region', { name: /radio AB3DE/i })
      const frame = region.locator('iframe')
      await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/)
      // YouTube's terms: never hidden for the sound, never under 200×200.
      const box = (await frame.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(200)
      expect(box.width).toBeGreaterThanOrEqual(200)
      await expect(region.getByRole('complementary', { name: /up next/i }).getByText('couvbat/abysses')).toBeVisible()
      expect(pageErrors).toEqual([])
    })

    test('a track that finishes hands over to the video after it, and the queue moves on', async ({ page, api }) => {
      // This widget answers the page's first message by saying the track has ended,
      // which is all the handover needs from it.
      await page.route('https://w.soundcloud.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `${STUB}<script>
            addEventListener('message', function once() {
              removeEventListener('message', once)
              parent.postMessage(JSON.stringify({ method: 'finish' }), '*')
            })
          </script>`,
        }),
      )
      api.room({
        ...ROOM,
        kind: 'radio',
        state: { media: TRACK, position: 0, playing: true, at: Date.now() },
        queue: ['aqz-KE-bpKQ'],
        members: 1,
      })
      await page.goto('/radio')
      await page.getByRole('button', { name: /start a room/i }).click()

      const region = page.getByRole('region', { name: /radio AB3DE/i })
      await expect(region.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?/)
      await expect(region.getByRole('complementary', { name: /up next/i }).getByText(/nothing queued/i)).toBeVisible()
      expect(api.sent('POST', '/rooms/AB3DE/state').map((r) => r.body)).toContainEqual({
        media: 'aqz-KE-bpKQ',
        queue: [],
        position: 0,
        playing: true,
      })
    })
  })

  test('a code nobody has is reported as such', async ({ page, api }) => {
    // Nothing stubbed for this code: the stream 501s until EventSource gives up, and
    // the page then asks the room directly and hears 404.
    api.fail('GET', '/rooms/ZZZZZ', 404)
    await page.goto('/watch/ZZZZZ')

    await expect(page.getByText(/has ended|never existed/i)).toBeVisible({ timeout: 20_000 })
  })
})
