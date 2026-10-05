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
    // The list is rendered by the app, not the HTML: read it once it is there, not the
    // instant the document loads, or a slow machine finds no tools at all.
    const links = page.locator('a[href^="/tools/"]')
    await expect(links.first()).toBeVisible()
    const ids = await links.evaluateAll((all) => all.map((link) => link.getAttribute('href')!.slice('/tools/'.length)))
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

  test('the acid tool plays from a click, and leaves the URL alone', async ({ page, cspViolations }) => {
    // The default pattern at 250 bpm, as `encode` writes it. The panel reads `?p=` once.
    const code = 'AchIKhE8gEKVEMhF6rE8iEPBEL4JRsigbrRG'
    await page.goto(`/tools/acid?p=${code}`)
    const region = page.getByRole('region', { name: /acid sequencer/i })
    await expect(region.getByText('250 bpm', { exact: true })).toBeVisible()

    // The playhead is read off the audio clock, so its moving at all means the context
    // started inside the click and the scheduler is booking steps against it.
    await region.getByRole('button', { name: 'play' }).click()
    const current = region.getByTestId('acid-steps').locator('[data-current]')
    await expect(current).toHaveCount(1)
    const first = await current.getAttribute('data-current')
    await expect.poll(() => current.getAttribute('data-current')).not.toBe(first)

    // A knob drag is heard, not written to the URL: a `router.replace` would scroll the
    // page to the top on every step of the drag.
    const scrolled = await page.evaluate(() => window.scrollY)
    await region.getByLabel(/cutoff/).evaluate((input: HTMLInputElement) => {
      input.value = '200'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(region.getByText(/kHz/)).toBeVisible()
    expect(page.url()).toMatch(new RegExp(`\\?p=${code}$`))
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)

    // The link is built when it's asked for, from the pattern as it is now.
    await region.getByRole('button', { name: 'copy link' }).click()
    await expect(region.getByText(/\/tools\/acid\?p=/)).toBeVisible()
    await expect(region.getByText(new RegExp(`\\?p=${code}$`))).toHaveCount(0)

    await region.getByRole('button', { name: 'stop' }).click()
    await expect(current).toHaveCount(0)
    expect(cspViolations).toEqual([])
  })
})
