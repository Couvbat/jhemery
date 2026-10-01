import { expect, test } from './fixtures'
import { LONDON, TAG, exif, insertSegment, short, tiff } from '../src/tools/__tests__/fixtures/exif'

/**
 * The image tool's two claims, in a real browser: a phone photo comes out upright, and the
 * check on the output finds nothing the photo carried. jsdom has neither `createImageBitmap`
 * nor an encoder, so the parser's own specs can't see either; everything else about the
 * inspector is pinned in `image.spec.ts`.
 *
 * Under the production CSP, since the tool previews through `blob:` URLs and a refused one
 * fails silently.
 */

test.use({ serviceWorkers: 'block' })

test('the image tool lists what a photo gives away, turns it upright and verifies its output', async ({
  page,
  cspViolations,
}) => {
  await page.goto('/tools/image')
  const region = page.getByRole('region', { name: /image converter/i })

  // Stored 64 × 48 by the browser's own encoder, then given the Exif a phone held upright
  // writes: Orientation 6 (show it turned 90° clockwise) and a position. Upright it is 48 × 64.
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#39ff14'
    ctx.fillRect(0, 0, 64, 48)
    return canvas.toDataURL('image/jpeg')
  })
  const drawn = new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
  const photo = insertSegment(drawn, exif(tiff('MM', { ifd0: [short(TAG.orientation, 6)], gps: LONDON.entries })))
  await region.locator('input[type=file]').setInputFiles({
    name: 'phone.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(photo),
  })

  const metadata = region.getByTestId('image-metadata')
  await expect(metadata).toContainText(`${LONDON.value} — this says where you stood`)
  await expect(metadata).toContainText('6 — shown turned 90° clockwise')

  // The default WebP: Chromium's encoder writes an sRGB profile of its own, which the check
  // counts, so all this can hold is that nothing from the photo came through.
  const verdict = region.getByTestId('image-verdict')
  await expect(verdict).toHaveText(/^(0 fields — verified|1 field survived re-encoding: colour profile)$/)
  // PNG, which no engine gives a profile.
  await region.getByLabel('--format').selectOption('png')
  await expect(verdict).toHaveText('0 fields — verified')

  await expect(region).toContainText('phone.jpg · 48×64')
  const output = region.locator('figure img').nth(1)
  await expect.poll(() => output.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(48)
  expect(await output.evaluate((img) => (img as HTMLImageElement).naturalHeight)).toBe(64)
  expect(cspViolations).toEqual([])
})
