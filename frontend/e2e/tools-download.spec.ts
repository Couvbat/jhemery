import { expect, test } from './fixtures'

/**
 * What jsdom cannot see about the admin tier: that the tool is absent from the
 * page until the owner unlocks it, that the unlock is a round trip to the API and
 * not a client-side flag, and that once unlocked the panel drives the jobs API —
 * start, poll, save — against the stub. The server side of a download is the
 * backend's jest suite's business.
 */
/** What the stubbed API accepts as the owner's unlock. A fixture, not a credential. */
const UNLOCK = 'e2e-admin'
const JOB = {
  id: 'abcdefghijkl',
  url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  status: 'running' as const,
  progress: 0.42,
  filename: null,
  size: null,
  error: null,
  createdAt: Date.now(),
  finishedAt: null,
}
const DONE = { ...JOB, status: 'done' as const, progress: 1, filename: 'Big_Buck_Bunny.mp3', size: 4_000_000, finishedAt: Date.now() }

test.describe('the downloader', () => {
  test('is not on the tools page for a visitor, but its route asks for the password', async ({ page, api }) => {
    api.downloader(UNLOCK)
    await page.goto('/tools')
    await expect(page.getByRole('link', { name: /downloader/i })).toHaveCount(0)

    await page.goto('/tools/download')
    const region = page.getByRole('region', { name: /downloader/i })
    await expect(region.getByLabel(/admin password/i)).toBeVisible()
    await expect(region.getByRole('button', { name: /^download$/i })).toHaveCount(0)
  })

  test('a wrong password stays locked; the right one reveals the tool everywhere', async ({ page, api }) => {
    api.downloader(UNLOCK)
    await page.goto('/tools/download')
    const region = page.getByRole('region', { name: /downloader/i })

    await region.getByLabel(/admin password/i).fill('guess')
    await region.getByRole('button', { name: /unlock/i }).click()
    await expect(region.getByText(/try again/i)).toBeVisible()
    expect(api.sent('GET', '/jobs')).toHaveLength(1)

    await region.getByLabel(/admin password/i).fill(UNLOCK)
    await region.getByRole('button', { name: /unlock/i }).click()
    await expect(region.getByLabel(/youtube or soundcloud link/i)).toBeVisible()
    // The listing below the panel now carries the admin tier too.
    await expect(page.getByRole('link', { name: /downloader/i })).toBeVisible()

    // And the unlock survives a reload — it lives in the tab.
    await page.reload()
    await expect(page.getByRole('region', { name: /downloader/i }).getByLabel(/youtube or soundcloud link/i)).toBeVisible()
  })

  test('starts a job, shows its progress, and saves the file once it is ready', async ({ page, api }) => {
    api.downloader(UNLOCK, [])
    api.post('/jobs', JOB, 202)
    let polls = 0
    await page.route(`**/__e2e-api/jobs`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      if (route.request().headers()['x-admin-password'] !== UNLOCK) return route.fallback()
      polls += 1
      // Running for the first two polls, then done.
      const jobs = polls > 2 ? [DONE] : polls > 0 ? [JOB] : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, jobs }) })
    })
    await page.route(`**/__e2e-api/jobs/${JOB.id}/file`, (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(16) }),
    )

    await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value), ['couvbat:sudo', UNLOCK])
    await page.goto('/tools/download')
    const region = page.getByRole('region', { name: /downloader/i })

    await region.getByLabel(/youtube or soundcloud link/i).fill('https://youtu.be/aqz-KE-bpKQ')
    await region.getByRole('button', { name: /^download$/i }).click()
    expect(api.sent('POST', '/jobs').map((r) => r.body)).toEqual([{ url: 'https://youtu.be/aqz-KE-bpKQ' }])

    await expect(region.getByText(/downloading/i)).toBeVisible()
    await expect(region.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')

    await expect(region.getByText('Big_Buck_Bunny.mp3')).toBeVisible({ timeout: 10_000 })
    const download = page.waitForEvent('download')
    await region.getByRole('button', { name: /^save$/i }).click()
    expect((await download).suggestedFilename()).toBe('Big_Buck_Bunny.mp3')
    // Fetch-once: the job leaves the list with the file.
    await expect(region.getByText('Big_Buck_Bunny.mp3')).toHaveCount(0)
  })

  test('says so when the downloader is off on the deployment', async ({ page, api }) => {
    api.downloader(UNLOCK, [], false)
    await page.addInitScript(([key, value]) => sessionStorage.setItem(key, value), ['couvbat:sudo', UNLOCK])
    await page.goto('/tools/download')
    await expect(page.getByRole('region', { name: /downloader/i }).getByText(/off on this deployment/i)).toBeVisible()
  })
})
