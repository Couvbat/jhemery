import { expect, test } from './fixtures'

/**
 * `/lab`, where jsdom can't reach: that the route survives the SPA fallback, that the map
 * is whole with the API down (the topology is content, the snapshot only colours it),
 * that a real snapshot reaches a card, and that a phone gets one column. What each node
 * reads for each report is decided in `lib/__tests__/lab.spec.ts`.
 */

const state = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`[data-node="${id}"]`).getByTestId('lab-state').first()

test('draws the whole map with the API unreachable, and says so', async ({ page, api, pageErrors }) => {
  api.use('down')
  await page.goto('/lab')
  const map = page.getByTestId('lab-map')
  for (const name of ['Cloudflare', 'Cloudflare Tunnel', 'Nginx Proxy Manager', 'Optimus', 'Poseidon', 'Ollama']) {
    await expect(map).toContainText(name)
  }
  await expect(page.getByTestId('lab-feed')).toHaveAttribute('data-feed', 'unreachable')
  await expect(state(page, 'poseidon')).toHaveText(/no data/)
  expect(pageErrors).toEqual([])
})

test('reads poseidon as up from a snapshot', async ({ page, api }) => {
  api.use('configured')
  await page.goto('/lab')
  await expect(page.getByTestId('lab-feed')).toHaveAttribute('data-feed', 'live')
  await expect(state(page, 'poseidon')).toHaveText(/^up$/)
  await expect(state(page, 'n8n')).toHaveText(/^down$/)
  await expect(page.locator('[data-node="poseidon"]').first()).toContainText('tank ONLINE, 61 % used')
})

test('says the feed is off on an API that isn’t configured for it', async ({ page, api }) => {
  api.use('unconfigured')
  await page.goto('/lab')
  await expect(page.getByTestId('lab-feed')).toContainText('live data is off here')
})

test('folds to one column at 375 px, with no sideways scroll', async ({ page, api }) => {
  api.use('configured')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/lab')
  await expect(state(page, 'poseidon')).toHaveText(/^up$/)
  const layout = await page.getByTestId('lab-map').evaluate((map) => ({
    columns: getComputedStyle(map.querySelector(':scope > .grid')!).gridTemplateColumns.split(' ').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  expect(layout).toEqual({ columns: 1, overflow: false })
})
