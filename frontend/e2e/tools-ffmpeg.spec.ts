import { readFileSync } from 'node:fs'
import { API_PREFIX, BASE_URL } from './constants'
import { expect, test } from './fixtures'

/**
 * What jsdom cannot see: that a 32 MB WebAssembly core loads from our own `/assets/`
 * into a module worker and produces bytes — and that it does so under the *production*
 * Content-Security-Policy. That header lives in public/.htaccess, which no local
 * server applies, so this test reads it out of the file and stamps it onto every
 * same-origin response, the worker script included. A `script-src` that lost
 * `'wasm-unsafe-eval'` fails here rather than on jhemery.xyz.
 */
const CSP = /Content-Security-Policy "([^"]+)"/.exec(
  readFileSync(new URL('../public/.htaccess', import.meta.url), 'utf8'),
)?.[1]

/** One second of a 440 Hz sine, 8 kHz mono 16-bit: a real WAV, made here rather than
 *  committed as a binary. */
function wav(seconds: number): Buffer {
  const rate = 8000
  const samples = seconds * rate
  const data = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

test.describe('the ffmpeg tool', () => {
  test.beforeEach(async ({ page }) => {
    expect(CSP, 'public/.htaccess should still carry a Content-Security-Policy').toBeTruthy()
    const origin = new URL(BASE_URL).origin
    await page.route(
      (url) => url.origin === origin && !url.pathname.endsWith('.wasm'),
      async (route) => {
        // The stubbed backend lives under this origin too; leave it to the api fixture.
        if (new URL(route.request().url()).pathname.startsWith(API_PREFIX)) return route.fallback()
        const response = await route.fetch()
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'content-security-policy': CSP! },
        })
      },
    )
  })

  test('fetches nothing until asked, then turns a wav into an mp3 under the production CSP', async ({
    page,
    pageErrors,
  }) => {
    test.slow()
    const wasmRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.wasm')) wasmRequests.push(request.url())
    })

    await page.goto('/tools/ffmpeg')
    const region = page.getByRole('region', { name: /audio & video/i })
    const download = region.getByRole('button', { name: /download ffmpeg/i })
    await expect(download).toBeVisible()
    await expect(download).toContainText('32')
    expect(wasmRequests, 'the core must never download on its own').toEqual([])

    await download.click()
    await expect(region.getByText(/ffmpeg ready/i)).toBeVisible({ timeout: 60_000 })
    expect(wasmRequests.length).toBeGreaterThan(0)

    await region
      .locator('input[type=file]')
      .setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav(1) })
    await expect(region.getByText(/pcm_s16le/)).toBeVisible({ timeout: 20_000 })

    await region.getByRole('button', { name: /^convert$/i }).click()
    await expect(region.getByRole('link', { name: /download tone\.mp3/i })).toBeVisible({ timeout: 60_000 })
    expect(pageErrors).toEqual([])
  })
})
