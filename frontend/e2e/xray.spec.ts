import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import type { Terminal } from './fixtures/terminal'
import { messages } from '@/i18n/messages'
import { commitSha } from '../vite-plugins/git'

/**
 * X-ray mode where jsdom can't follow it: that the build really stamps the components it
 * ships (a production build keeps no `__file`, which is the reason for the stamp), that
 * the layer's chunk and its words map load when `xray` runs, and that a tag's link points
 * at the commit the build came from. Then what only a laid-out page with a real keyboard
 * shows: where the chip stands on a phone, whose Esc it is when something else is open,
 * and where focus is when a focused tag's component scrolls away. What a tag says and
 * where it goes is `lib/__tests__/xray.spec.ts`'s, and what is stamped,
 * `src/__tests__/xray-build.spec.ts`'s.
 */

const HERO = 'frontend/src/components/sections/HeroSection.vue'
const LAUNCHER = 'frontend/src/components/terminal/TerminalLauncher.vue'

const onPhone = () => test.info().project.name === 'mobile'

/** What turning x-ray on says: a phone has no Esc, so it is told of the button alone. */
function announced(phone: boolean): RegExp {
  return phone ? /^X-ray on: [^.]+\. The exit button ends it\.$/ : /^X-ray on: [^.]+\. Esc or the exit button ends it\.$/
}

/** The tag that links to `file`: its text also holds what it reads to a screen reader. */
function tagOf(layer: Locator, file: string): Locator {
  return layer.locator('[data-xray-tag]').filter({ has: layer.page().getByRole('link', { name: file, exact: true }) })
}

/**
 * Runs a line that closes the terminal (`xray`, `matrix`), and waits until the
 * panel is gone rather than fading: a key sent while it fades still lands in its input.
 * Not `terminal.run()`, whose settle check can be left waiting on an input that leaves
 * between its two looks.
 */
async function runClosing(terminal: Terminal, line: string): Promise<void> {
  await terminal.input.fill(line)
  await terminal.input.press('Enter')
  await expect(terminal.panel).toBeHidden()
}

test('`?run=xray` tags the hero with its file, linked at the build’s commit', async ({ page, pageErrors }) => {
  await page.goto('/?run=xray')
  const layer = page.getByTestId('xray-layer')
  const hero = tagOf(layer, 'HeroSection.vue')
  await expect(hero).toBeVisible({ timeout: 15_000 })

  // The stamp is on the page's own element, and the tag reads it.
  await expect(page.locator(`#about[data-src="${HERO}"]`)).toHaveCount(1)
  await expect(hero.getByRole('link', { name: 'HeroSection.vue', exact: true })).toHaveAttribute(
    'href',
    `https://github.com/Couvbat/jhemery/blob/${commitSha()}/${HERO}`,
  )
  // The words, resolved through the `@/content` barrel by the build.
  await expect(hero.getByRole('link', { name: 'profile.ts', exact: true })).toHaveAttribute(
    'href',
    new RegExp(`/blob/${commitSha()}/frontend/src/content/profile\\.ts$`),
  )

  // The terminal ran it and got out of the way, the link's parameter went with it, and
  // nothing in the layer took focus.
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(/\/$/)
  await expect(layer.locator(':focus')).toHaveCount(0)
  await expect(layer.getByRole('navigation', { name: messages.xray.label.en })).toBeAttached()

  // So it is said, in a live region, where a screen reader hears it: the terminal's own
  // output went when it closed.
  await expect(layer.getByRole('status')).toHaveText(announced(onPhone()))

  // The canvas loads on idle, after the first measure: the layer notices it arrive.
  await expect(tagOf(layer, 'ThreeBackground.vue')).toContainText(/ · \d+ shapes$/, { timeout: 15_000 })

  await page.keyboard.press('Escape')
  await expect(layer).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('the exit button ends it, and a tool is tagged through its frame', async ({ page, terminal }) => {
  test.skip(onPhone(), 'Typed at the prompt, which a phone doesn’t have.')

  await page.goto('/tools/hash')
  await terminal.open()
  await runClosing(terminal, 'xray')
  const layer = page.getByTestId('xray-layer')
  // `HashTool.vue` is one `<ToolFrame>`: the frame's tag names both.
  const frame = tagOf(layer, 'HashTool.vue')
  await expect(frame).toBeVisible({ timeout: 15_000 })
  await expect(frame.getByRole('link')).toHaveText(['HashTool.vue', 'messages.ts', 'ToolFrame.vue'])

  await layer.getByRole('button', { name: messages.xray.exitLabel.en }).click()
  await expect(layer).toHaveCount(0)
})

// Narrower than the Pixel 5: in English the chip reached the launcher only below 387px, and
// 360 is a common phone. In French it reached it at any phone width, and its exit button
// sat over the launcher's left end.
for (const locale of ['en', 'fr'] as const) {
  test(`on a phone the chip stands clear of the launcher, in ${locale}`, async ({ page, app }) => {
    test.skip(!onPhone(), 'The launcher’s row and the 44px targets are the touch layout’s.')

    await app.seed({ locale })
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/?run=xray')
    const layer = page.getByTestId('xray-layer')
    // Waited for: the canvas loads on idle, and its tag, the widest, starts in the chip's corner.
    await expect(tagOf(layer, 'ThreeBackground.vue')).toContainText(/ · \d+ \S+$/, { timeout: 15_000 })

    const exit = layer.getByRole('button', { name: messages.xray.exitLabel[locale] })
    const target = (await exit.boundingBox())!
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)

    // Every part of the launcher is the launcher's to tap. The one thing of the layer's
    // allowed over it is its own tag, at its corner as every component's is; neither the
    // chip nor the canvas's tag, which starts in the chip's corner.
    const launcher = page.getByRole('button', { name: messages.terminal.open[locale] })
    const covered = await launcher.evaluate((button, own) => {
      const box = button.getBoundingClientRect()
      const misses: string[] = []
      for (const fx of [0.03, 0.5, 0.97]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          const x = box.left + box.width * fx
          const y = box.top + box.height * fy
          const hit = document.elementFromPoint(x, y)
          if (button.contains(hit) || hit?.closest('[data-xray-tag]')?.getAttribute('data-xray-tag') === own) continue
          misses.push(`${Math.round(x)},${Math.round(y)}: ${hit?.textContent?.trim()}`)
        }
      }
      return misses
    }, LAUNCHER)
    expect(covered).toEqual([])

    // Its left end, where the French chip's exit button used to take the tap.
    const box = (await launcher.boundingBox())!
    await launcher.tap({ position: { x: 6, y: box.height / 2 } })
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
    // Still on, under the terminal, for when it closes.
    await expect(layer).toHaveCount(1)
  })
}

test('an Esc that disarms a clear on /privacy leaves x-ray on', async ({ page }) => {
  test.skip(onPhone(), 'Esc is a keyboard’s.')

  await page.addInitScript(() => localStorage.setItem('couvbat:games:snake', '12'))
  await page.goto('/privacy?run=xray')
  const layer = page.getByTestId('xray-layer')
  await expect(layer.getByRole('button', { name: messages.xray.exitLabel.en })).toBeVisible({ timeout: 15_000 })

  // From the keyboard, which is where Esc comes from, and so no tag is in the way of a click.
  const clear = page.getByTestId('privacy-group-scores').getByRole('button').first()
  await clear.focus()
  await page.keyboard.press('Enter')
  await expect(clear).toHaveText(/cancel/)

  await page.keyboard.press('Escape')
  await expect(clear).toHaveText(/clear best scores/)
  await expect(layer).toHaveCount(1)
  // Nothing armed now, so the next one is x-ray's.
  await page.keyboard.press('Escape')
  await expect(layer).toHaveCount(0)
})

test('the matrix rain and the boot replay keep their own Esc', async ({ page, terminal }) => {
  test.skip(onPhone(), 'Typed at the prompt, which a phone doesn’t have.')

  await page.goto('/')
  await terminal.open()
  await runClosing(terminal, 'xray')
  const layer = page.getByTestId('xray-layer')
  await expect(layer.getByRole('button', { name: messages.xray.exitLabel.en })).toBeVisible({ timeout: 15_000 })

  await terminal.open()
  await runClosing(terminal, 'matrix')
  const rain = page.getByText(messages.matrix.wake.en)
  await expect(rain).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(rain).toBeHidden()
  await expect(layer).toHaveCount(1)

  await terminal.open()
  await terminal.input.fill('reboot')
  await terminal.input.press('Enter')
  // The fourth line is 390 ms in: past the 300 ms before the replay listens for a key,
  // and well before it ends on its own. The panel, closing under it, is waited out too.
  await expect(page.getByText('loading module: vue@3')).toBeVisible()
  await expect(terminal.panel).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByText('couvsh 1.0 booting…')).toBeHidden()
  await expect(layer).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(layer).toHaveCount(0)
})

test('a focused tag keeps focus when its component scrolls away', async ({ page }) => {
  test.skip(onPhone(), 'End, pressed on a focused link, is a keyboard’s.')

  await page.goto('/?run=xray')
  const layer = page.getByTestId('xray-layer')
  const hero = tagOf(layer, 'HeroSection.vue')
  const link = hero.getByRole('link', { name: 'HeroSection.vue', exact: true })
  await expect(link).toBeVisible({ timeout: 15_000 })

  await link.focus()
  // A focused link lets End through to the page, which scrolls to its foot: the layer
  // measures there, with the hero gone from the screen.
  await page.keyboard.press('End')
  await expect(tagOf(layer, 'SiteFooter.vue')).toBeVisible()
  await expect(page.locator('#about')).not.toBeInViewport()
  await expect(link).toBeFocused()
  await expect(hero).toBeVisible()

  // Once focus moves on, the tag goes with the component it named.
  await page.locator('footer a').first().focus()
  await expect(hero).toHaveCount(0)
})
