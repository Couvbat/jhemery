import { expect, test } from './fixtures'

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

test.beforeEach(async ({ page }) => {
  await page.route('**/*.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }),
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

  test('a code nobody has is reported as such', async ({ page, api }) => {
    // Nothing stubbed for this code: the stream 501s until EventSource gives up, and
    // the page then asks the room directly and hears 404.
    api.fail('GET', '/rooms/ZZZZZ', 404)
    await page.goto('/watch/ZZZZZ')

    await expect(page.getByText(/has ended|never existed/i)).toBeVisible({ timeout: 20_000 })
  })
})
