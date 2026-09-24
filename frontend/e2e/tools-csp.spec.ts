import { expect, test } from './fixtures'

/**
 * The tools under the production Content-Security-Policy.
 *
 * Every tool runs entirely in the browser, which makes it the part of the site most
 * likely to need something the policy was not written for — a `blob:` preview, a
 * worker, a wasm compile — and the part where a refusal is quietest: a blocked
 * `<img>` is a broken icon, not an exception. The ffmpeg tool has its own spec, which
 * pays for the 32 MB core; this one covers the rest.
 */

test.use({ serviceWorkers: 'block' })

test.describe('the tools under the production CSP', () => {
  test('every listed tool opens without a refusal', async ({ page, cspViolations }) => {
    await page.goto('/tools')
    const ids = await page
      .locator('a[href^="/tools/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')!.slice('/tools/'.length)))
    expect(ids.length).toBeGreaterThan(0)

    for (const id of ids) {
      // A hard navigation each time, so every panel arrives under a fresh document
      // carrying the header rather than inheriting the first one's.
      await page.goto(`/tools/${id}`)
      await expect(page.getByRole('region').getByText(`${id}.sh`, { exact: true })).toBeVisible()
    }
    expect(cspViolations).toEqual([])
  })

  test('the image tool previews the source and the result', async ({ page, cspViolations }) => {
    await page.goto('/tools/image')
    const region = page.getByRole('region', { name: /image converter/i })

    // Drawn by the browser's own encoder rather than committed as a binary.
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#39ff14'
      ctx.fillRect(0, 0, 64, 48)
      return canvas.toDataURL('image/png')
    })
    await region.locator('input[type=file]').setInputFiles({
      name: 'swatch.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
    })

    // Both previews are object URLs. A refused one is still in the DOM and still
    // `complete` — it just never decodes, so its natural width stays 0.
    const previews = region.locator('figure img')
    await expect(previews).toHaveCount(2)
    await expect
      .poll(() => previews.evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete)))
      .toBe(true)
    const widths = await previews.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).naturalWidth))
    expect(widths, `refused: ${cspViolations.join('; ') || 'nothing'}`).toEqual([64, 64])
    expect(cspViolations).toEqual([])
  })

  test('the regex tool runs its matcher in a worker', async ({ page, cspViolations }) => {
    // Opening the panel is not enough: the worker is only created when a pattern runs,
    // and a refused one reads as the one-second timeout, not as an error.
    await page.goto('/tools/regex')
    const region = page.getByRole('region', { name: /regex tester/i })
    await expect(region.getByTestId('regex-highlight').locator('mark')).toHaveCount(2)
    expect(cspViolations).toEqual([])
  })

  test('the qr tool previews its code', async ({ page, cspViolations }) => {
    await page.goto('/tools/qr')
    const preview = page.getByRole('region', { name: /qr code/i }).getByTestId('qr-preview')
    await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).complete)).toBe(true)
    const width = await preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)
    expect(width, `refused: ${cspViolations.join('; ') || 'nothing'}`).toBeGreaterThan(0)
    expect(cspViolations).toEqual([])
  })
})
