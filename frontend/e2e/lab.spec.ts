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

// Ask the lab (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §5): the rendered
// form, which the unit suite can't mount. The runner and its copy are `lib/__tests__/ask-session.spec.ts`'s.
test('asks the lab from the page: suggestions fill without sending, and an answer shows its work', async ({ page, api }) => {
  api.use('configured').ask(['Ollama, on poseidon.'], {
    meta: {
      model: 'gemma4:e4b',
      outputTokens: 6,
      firstTokenMs: 400,
      totalMs: 800,
      tokensPerSecond: 15,
      sources: [{ title: 'Why the guestbook ticker polls', target: 'why polling' }],
    },
  })
  await page.goto('/lab')
  const panel = page.getByTestId('ask-the-lab')
  const box = panel.getByRole('textbox', { name: 'Your question' })

  await panel.getByRole('button', { name: 'Which models are loaded?' }).click()
  await expect(box).toHaveValue('Which models are loaded?')
  expect(api.sent('POST', '/ask')).toHaveLength(0)

  await box.fill('hi')
  await panel.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText('A question needs at least 3 characters.')
  expect(api.sent('POST', '/ask')).toHaveLength(0)

  await box.fill('What runs this site?')
  await panel.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(panel.getByRole('log')).toContainText('Ollama, on poseidon.')
  await expect(panel.getByTestId('ask-meta')).toHaveText('gemma4:e4b · 15 tok/s · first token 0.4 s')
  await expect(panel.getByRole('link', { name: 'Why the guestbook ticker polls' })).toHaveAttribute('href', '/?run=why%20polling')
  expect(api.sent('POST', '/ask').map((call) => call.body)).toEqual([{ question: 'What runs this site?', locale: 'en' }])
})

// §10 keeps the terminal's prompt off phones; an ordinary form in the page is a phone's too.
test('gives a phone the form, inside the screen', async ({ page, api }) => {
  api.use('configured')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/lab')
  const box = page.getByTestId('ask-the-lab').getByRole('textbox', { name: 'Your question' })
  await expect(box).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(width).toBe(false)
})
