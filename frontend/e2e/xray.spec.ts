import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { messages } from '@/i18n/messages'
import { commitSha } from '../vite-plugins/git'

/**
 * X-ray mode where jsdom can't follow it: that the build really stamps the components it
 * ships (a production build keeps no `__file`, which is the reason for the stamp), that
 * the layer's chunk and its words map load when `xray` runs, and that a tag's link points
 * at the commit the build came from. What a tag says and where it goes is
 * `lib/__tests__/xray.spec.ts`'s, and what is stamped, `src/__tests__/xray-build.spec.ts`'s.
 */

const HERO = 'frontend/src/components/sections/HeroSection.vue'

/** The tag that links to `file`: its text also holds what it reads to a screen reader. */
function tagOf(layer: Locator, file: string): Locator {
  return layer.locator('[data-xray-tag]').filter({ has: layer.page().getByRole('link', { name: file, exact: true }) })
}

test('`?run=xray` tags the hero with its file, linked at the build’s commit', async ({ page, pageErrors }) => {
  test.skip(test.info().project.name === 'mobile', 'A `?run=` link opens the terminal, which is a desktop’s.')

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

  // The canvas loads on idle, after the first measure: the layer notices it arrive.
  await expect(tagOf(layer, 'ThreeBackground.vue')).toContainText(/ · \d+ shapes$/, { timeout: 15_000 })

  await page.keyboard.press('Escape')
  await expect(layer).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('the exit button ends it, and a tool is tagged through its frame', async ({ page, terminal }) => {
  test.skip(test.info().project.name === 'mobile', 'The terminal is a desktop’s.')

  await page.goto('/tools/hash')
  await terminal.open()
  await terminal.run('xray')
  const layer = page.getByTestId('xray-layer')
  // `HashTool.vue` is one `<ToolFrame>`: the frame's tag names both.
  const frame = tagOf(layer, 'HashTool.vue')
  await expect(frame).toBeVisible({ timeout: 15_000 })
  await expect(frame.getByRole('link')).toHaveText(['HashTool.vue', 'messages.ts', 'ToolFrame.vue'])

  await layer.getByRole('button', { name: messages.xray.exitLabel.en }).click()
  await expect(layer).toHaveCount(0)
})
