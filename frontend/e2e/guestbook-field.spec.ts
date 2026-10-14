import type { Page } from '@playwright/test'
import type { GuestbookEntry } from '@/lib/api'
import { seededRandom, shapeLayout, signatureDay } from '@/components/signatures'
import { API_ORIGIN } from './constants'
import { expect, test } from './fixtures'
import { guestbookDisabled } from './fixtures/payloads'

/**
 * The guestbook's newest entries as wireframes (`components/signatures.ts`). Which entries,
 * which shapes and what a click says are vitest's (`signatures.spec.ts`); what only a real
 * WebGL page can show is that the field draws them from the ticker's poll and asks for
 * nothing itself, that a click on one names it in a label the screen holds, that a
 * guestbook closing lets them all go, and that one arriving mid-swing still lands in its
 * own place.
 *
 * Pixels can't be counted, so the field writes how many signatures are staying onto the
 * canvas as `data-signatures`: a count, never a name. That attribute is this suite's only
 * window into the scene.
 */

/** Fourteen entries a day apart, newest first as the backend sends them. */
const entries: GuestbookEntry[] = Array.from({ length: 14 }, (_, i) => {
  const day = 20 - i
  return {
    id: `signature-${day}`,
    name: `signer ${day}`,
    message: `a message nobody should see in the field (${day})`,
    // Midday UTC: the label reads the visitor's calendar, and this is the same day in any zone.
    date: `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`,
  }
})

const field = (page: Page) => page.locator('canvas[data-signatures]')

test.describe('guestbook entries in the field', () => {
  test.beforeEach(async ({ app }) => {
    // `calm` holds the camera on its axis and drops the pointer's pull, so where a
    // signature sits on screen follows from its id alone.
    await app.seed({ motion: 'calm' })
  })

  test('draws the newest twelve, from the ticker’s own request', async ({ page, api, pageErrors }) => {
    api.get('/guestbook', { enabled: true, entries })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '12')
    // One request for the page: the ticker's first poll. The field asked for nothing.
    expect(api.sent('GET', '/guestbook')).toHaveLength(1)
    expect(pageErrors).toEqual([])
  })

  test('lets every signature go when the guestbook closes, and asks nothing more', async ({ page, api }) => {
    await page.clock.install()
    api.get('/guestbook', { enabled: true, entries })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '12')

    api.get('/guestbook', guestbookDisabled)
    await page.clock.fastForward(20_000)
    await expect(field(page)).toHaveAttribute('data-signatures', '0')

    // Closed is closed for the visit: three more intervals, and not one more request.
    for (let i = 0; i < 3; i++) await page.clock.fastForward(20_000)
    await everyRequestIn(page)
    expect(api.sent('GET', '/guestbook')).toHaveLength(2)
  })

  test('lets a deleted entry go on the next poll', async ({ page, api }) => {
    await page.clock.install()
    api.get('/guestbook', { enabled: true, entries: entries.slice(0, 3) })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '3')

    // The owner's `sudo rm`: the next page comes back without it.
    api.get('/guestbook', { enabled: true, entries: [entries[0], entries[2]] })
    await page.clock.fastForward(20_000)
    await expect(field(page)).toHaveAttribute('data-signatures', '2')
    expect(api.sent('GET', '/guestbook')).toHaveLength(2)
  })

  test('names the signer and the day on a click, and never the message', async ({ page, api, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'Thinned by `spawn`, typed at the prompt, which a phone doesn’t have.')
    api.get('/guestbook', { enabled: true, entries })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '12')

    // Down to one random shape, so almost nothing can stand between the camera and a
    // signature. The signatures are their own pool: `spawn` never touches them.
    await terminal.open()
    await terminal.run('spawn -17')
    await terminal.close()
    await expect(field(page)).toHaveAttribute('data-signatures', '12')

    const viewport = page.viewportSize()!
    const target = await pickTarget(page, entries.slice(0, 12), viewport)
    await page.mouse.click(target.x, target.y)

    const label = page.getByText(`signed by ${target.entry.name}, ${signatureDay(target.entry.date, 'en')}`)
    await expect(label).toBeVisible()
    await expect(page.getByText(target.entry.message)).toHaveCount(0)
  })

  // A label sits above the click, so one clicked through the header used to start above the
  // screen; on a phone a signature's wraps to two lines and was cut off further down.
  test('keeps the label inside the screen for a shape just under the top edge', async ({ page, api }) => {
    const viewport = page.viewportSize()!
    const top = underTheTop(viewport)
    api.get('/guestbook', { enabled: true, entries: top })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', String(top.length))

    const target = await pickTarget(page, top, viewport, ({ y }) => y >= 12 && y <= 30)
    await page.mouse.click(target.x, target.y)

    // Whichever shape the click found, its label is drawn from the click's point.
    const label = page.getByTestId('inspect-label')
    await expect(label).toBeVisible()
    await expect.poll(async () => (await label.boundingBox())!.y).toBeGreaterThanOrEqual(0)
    const box = (await label.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  })

  test('puts an entry that arrives mid-swing where its id says, once the swing is over', async ({ page, api, app, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'Thinned by `spawn`, typed at the prompt, which a phone doesn’t have.')
    // `full`, or there is no swing; nothing moves the pointer until the click, so the
    // camera stays on its axis all the same.
    await app.seed({ motion: 'full' })
    await page.clock.install()
    api.get('/guestbook', { enabled: true, entries: [] })
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '0')

    // Far enough from the axis the field turns about that 40° off would miss it.
    const viewport = page.viewportSize()!
    const target = await pickTarget(page, entries, viewport, (at) => wellInside(at, viewport) && at.axis >= 3)

    await terminal.open()
    await terminal.run('spawn -17')
    await terminal.run('cd tools')
    await expect(page).toHaveURL(/\/tools$/)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)

    // The next poll is held until the swing home is under way, then brings the entry.
    let answer!: () => void
    const held = new Promise<void>((resolve) => (answer = resolve))
    api.any('/guestbook', async (route) => {
      await held
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, entries: [target.entry] }) })
    })
    const asked = api.sent('GET', '/guestbook').length
    await page.clock.fastForward(20_000)
    await expect.poll(() => api.sent('GET', '/guestbook').length).toBe(asked + 1)

    // Time stands still from here, and moves only as far as the test says.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
    await page.evaluate(() => history.back())
    await expect(page.locator('.view-stage')).toHaveClass(/is-swinging/)
    await page.clock.runFor(200)
    answer()
    await expect(field(page)).toHaveAttribute('data-signatures', '1')
    await page.clock.runFor(2_000)
    await expect(page.locator('.view-stage')).not.toHaveClass(/is-swinging/)
    await expect(page).toHaveURL(/\/$/)

    await page.mouse.click(target.x, target.y)
    await expect(page.getByText(`signed by ${target.entry.name}, ${signatureDay(target.entry.date, 'en')}`)).toBeVisible()
  })
})

/**
 * Returns once every request the page has already started has reached the stub: one more,
 * started after them, reaches it after them. So a count read next is final rather than early.
 */
async function everyRequestIn(page: Page) {
  await page.evaluate((url) => fetch(url).then(() => undefined), `${API_ORIGIN}/stats`)
}

/**
 * Entries whose shapes sit just under the top edge, where a label above the click would
 * overhang it: none of the fourteen does, so their ids are searched for. Each name runs to
 * the backend's forty characters, which a phone's label has to wrap.
 */
function underTheTop(viewport: { width: number; height: number }): GuestbookEntry[] {
  const found: GuestbookEntry[] = []
  for (let n = 0; found.length < 12 && n < 10_000; n++) {
    const id = `top-${n}`
    const { kind, x, y } = project(id, viewport)
    if (kind === TORUS || y < 12 || y > 30 || x < 60 || x > viewport.width - 60) continue
    found.push({ id, name: `a signer near the top, number ${n}`.padEnd(40, '.'), message: 'hi', date: '2026-08-14T12:00:00.000Z' })
  }
  return found
}

// ThreeBackground's camera: a 60° vertical field of view from z = 10, looking at the
// origin, with the field's centre 4 units behind it and a spawn volume 14 high, 12 deep and
// as wide as the screen's half-extent at z = 0, twice over. Six kinds, the torus second.
const FOV = 60
const CAMERA_Z = 10
const FIELD_DEPTH = -4
const KINDS = 6
const TORUS = 1

/**
 * Where a signature's centre lands on screen, from its id, as the camera sees it with the
 * pointer never moved, and how far its home is from the vertical axis the field turns about.
 */
function project(id: string, { width, height }: { width: number; height: number }) {
  const aspect = width / height
  const tan = Math.tan((FOV * Math.PI) / 360)
  const { kind, place } = shapeLayout(seededRandom(id), KINDS)
  const x = place.x * tan * CAMERA_Z * aspect * 2
  const y = place.y * 14
  const depth = CAMERA_Z - (place.z * 12 + FIELD_DEPTH)
  return {
    kind,
    x: ((x / (depth * tan * aspect) + 1) / 2) * width,
    y: ((1 - y / (depth * tan)) / 2) * height,
    axis: Math.hypot(x, place.z * 12),
  }
}

type Projected = ReturnType<typeof project>

/** Clear of the screen's sides, of the header and of the bottom edge. */
function wellInside({ x, y }: Projected, viewport: { width: number; height: number }) {
  return x >= 60 && x <= viewport.width - 60 && y >= 100 && y <= viewport.height - 100
}

/**
 * The first signature whose centre is where `where` asks (by default well inside the
 * screen), isn't a torus (whose centre can be its hole) and isn't under one of the page's
 * own controls, which a click there would go to instead.
 */
async function pickTarget(
  page: Page,
  candidates: GuestbookEntry[],
  viewport: { width: number; height: number },
  where: (at: Projected) => boolean = (at) => wellInside(at, viewport),
) {
  for (const entry of candidates) {
    const at = project(entry.id, viewport)
    const { kind, x, y } = at
    if (kind === TORUS || !where(at)) continue
    const free = await page.evaluate(
      ([px, py]) =>
        !document
          .elementFromPoint(px!, py!)
          ?.closest('a, button, input, textarea, select, label, [role="button"], [role="dialog"]'),
      [x, y],
    )
    if (free) return { entry, x, y }
  }
  throw new Error('no signature in this viewport can be clicked; pick other ids')
}
