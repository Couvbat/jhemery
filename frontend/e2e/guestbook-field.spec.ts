import type { Page } from '@playwright/test'
import type { GuestbookEntry } from '@/lib/api'
import { seededRandom, shapeLayout, signatureDay } from '@/components/signatures'
import { expect, test } from './fixtures'
import { guestbookDisabled } from './fixtures/payloads'

/**
 * The guestbook's newest entries as wireframes (`components/signatures.ts`). Which entries,
 * which shapes and what a click says are vitest's (`signatures.spec.ts`); what only a real
 * WebGL page can show is that the field draws them from the ticker's poll and asks for
 * nothing itself, that a click on one names it, and that a closed guestbook draws none.
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

  test('draws none while the guestbook is closed, and asks nothing more', async ({ page, api }) => {
    api.get('/guestbook', guestbookDisabled)
    await page.goto('/')
    await expect(field(page)).toHaveAttribute('data-signatures', '0')
    expect(api.sent('GET', '/guestbook')).toHaveLength(1)
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
    test.skip(test.info().project.name === 'mobile', 'Thinned through the terminal, which a phone lacks.')
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
})

// ThreeBackground's camera: a 60° vertical field of view from z = 10, looking at the
// origin, with the field's centre 4 units behind it and a spawn volume 14 high, 12 deep and
// as wide as the screen's half-extent at z = 0, twice over. Six kinds, the torus second.
const FOV = 60
const CAMERA_Z = 10
const FIELD_DEPTH = -4
const KINDS = 6
const TORUS = 1

/** Where a signature's centre lands on screen, from its id, as the camera sees it under `calm`. */
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
  }
}

/**
 * The first signature whose centre is well inside the screen, isn't a torus (whose centre
 * can be its hole) and isn't under one of the page's own controls, which a click there
 * would go to instead.
 */
async function pickTarget(
  page: Page,
  candidates: GuestbookEntry[],
  viewport: { width: number; height: number },
) {
  for (const entry of candidates) {
    const { kind, x, y } = project(entry.id, viewport)
    if (kind === TORUS) continue
    if (x < 60 || x > viewport.width - 60 || y < 100 || y > viewport.height - 100) continue
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
