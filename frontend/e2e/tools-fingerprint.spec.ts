import { expect, test } from './fixtures'

/**
 * The fingerprint tool in a real browser. jsdom has no canvas, no audio and no WebGL,
 * so `fingerprint.spec.ts` can only prove those rows degrade to "not available"; this
 * proves they read, that the panel hashes them, and that unticking a row moves the hash.
 * The WebGL rows aren't asserted: a headless runner may have no GPU, and "not
 * available" is then the right answer.
 */
test.describe('the fingerprint tool', () => {
  test('renders the canvas and the audio, and hashes what it read', async ({ page, pageErrors }) => {
    await page.goto('/tools/fingerprint')
    const region = page.getByRole('region', { name: /browser fingerprint/i })
    const value = (row: string) => region.locator(`[data-row="${row}"]`).getByTestId('fingerprint-value')

    await expect(value('canvas')).toHaveText(/^[0-9a-f]{16}$/)
    await expect(value('audio')).toHaveText(/^[0-9a-f]{16}$/)
    await expect(value('screen_size')).toHaveText(/^\d+×\d+$/)

    const hash = region.getByTestId('fingerprint-hash')
    await expect(hash).toHaveText(/^[0-9a-f]{64}$/)
    const whole = (await hash.textContent())!.trim()

    // Unticking a row takes it out of the hash; ticking it again puts the hash back.
    const canvas = region.locator('[data-row="canvas"]').getByRole('checkbox')
    await canvas.uncheck()
    await expect(hash).not.toHaveText(whole)
    await expect(hash).toHaveText(/^[0-9a-f]{64}$/)
    await canvas.check()
    await expect(hash).toHaveText(whole)

    // Nothing changed in between, so reading again gives the same hash.
    await region.getByRole('button', { name: 'read again' }).click()
    await expect(hash).toHaveText(whole)
    expect(pageErrors).toEqual([])
  })

  // jsdom proves `cat` and the panel call the same function; only a real browser proves
  // they land on the same values, with the terminal's chunk carrying its own copy of it.
  test('cat /proc/self prints what the panel shows', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', '`cat` is typed at the prompt, which a phone doesn’t have.')
    await page.goto('/tools/fingerprint')
    const region = page.getByRole('region', { name: /browser fingerprint/i })
    const value = (row: string) => region.locator(`[data-row="${row}"]`).getByTestId('fingerprint-value')
    await expect(value('screen_size')).toHaveText(/^\d+×\d+$/)
    const size = (await value('screen_size').textContent())!.trim()
    const cores = (await value('cores').textContent())!.trim()

    await terminal.open()
    await terminal.run('cat /proc/self/screen')
    await terminal.expectOutput(new RegExp(`screen_size +${size}`))
    await terminal.run('cat /proc/self/hardware')
    await terminal.expectOutput(new RegExp(`cores +${cores}`))
  })

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.goto('/tools/fingerprint')
    const region = page.getByRole('region', { name: /browser fingerprint/i })
    await expect(region.getByTestId('fingerprint-hash')).toHaveText(/^[0-9a-f]{64}$/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
