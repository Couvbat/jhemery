import { expect, test } from './fixtures'
import { gaming } from '@/content/gaming'
import { filenameFor } from '@/terminal/commands/guestbook-fs'
import {
  githubActivityConfigured,
  githubContributionsConfigured,
  githubWorkflowConfigured,
  guestbookConfigured,
  marketsConfigured,
  steamConfigured,
  weatherConfigured,
} from './fixtures/payloads'

/**
 * Graceful degradation — the invariant CLAUDE.md states most firmly, and the one the
 * unit tests structurally cannot reach.
 *
 * Every optional integration has three states, not two: configured, *unconfigured*
 * (the backend answers `{ configured: false }` because a key is missing — a normal
 * 200, not an error), and unreachable. Each has to render something honest, and none
 * of them may throw. A jsdom test can assert the first; only a browser with a real
 * fetch stack can tell you the third does not put a red box in the console of anyone
 * visiting while the API restarts.
 *
 * So each block below runs the same shape three times. The repetition is the test.
 */

test.describe('steam', () => {
  test('configured — the gaming section shows live activity', async ({ page, api }) => {
    api.use('configured')
    await page.goto('/')

    const section = page.locator('#gaming')
    await expect(section).toContainText(steamConfigured.profile!.name)
    await expect(section).toContainText(steamConfigured.profile!.inGame!)
  })

  test('unconfigured — falls back to the static game log', async ({ page, api, pageErrors }) => {
    api.use('unconfigured')
    await page.goto('/')

    const section = page.locator('#gaming')
    await expect(section).toContainText(gaming.fallbackGames[0]!.name)
    await expect(section).not.toContainText(steamConfigured.profile!.name)
    expect(pageErrors).toEqual([])
  })

  test('down — same fallback, and nothing thrown', async ({ page, api, pageErrors }) => {
    api.use('down')
    await page.goto('/')

    await expect(page.locator('#gaming')).toContainText(gaming.fallbackGames[0]!.name)
    expect(pageErrors).toEqual([])
  })
})

test.describe('github', () => {
  test('configured — commits, build status and heatmap all render', async ({ page, api }) => {
    api.use('configured')
    await page.goto('/')

    const section = page.locator('#projects')
    await expect(section).toContainText(githubActivityConfigured.commits![0]!.message)
    await expect(section).toContainText(githubWorkflowConfigured.runs![0]!.name)
    // The heatmap prints its yearly total in the card's title bar.
    await expect(section).toContainText(String(githubContributionsConfigured.total))
  })

  test('unconfigured — the extras disappear, the curated projects stay', async ({
    page,
    api,
    pageErrors,
  }) => {
    api.use('unconfigured')
    await page.goto('/')

    const section = page.locator('#projects')
    // No token means no heatmap and no build card at all — each is `v-if`'d on its
    // own data rather than rendering an empty shell.
    await expect(section).not.toContainText(githubWorkflowConfigured.runs![0]!.name)
    await expect(section).not.toContainText(githubActivityConfigured.commits![0]!.message)
    // The hand-written project cards are content, not live data, and are unaffected.
    await expect(section.getByRole('heading', { level: 2 })).toBeVisible()
    expect(pageErrors).toEqual([])
  })

  test('down — same, and nothing thrown', async ({ page, api, pageErrors }) => {
    api.use('down')
    await page.goto('/')

    await expect(page.locator('#projects')).toBeVisible()
    await expect(page.locator('#projects')).not.toContainText(
      githubWorkflowConfigured.runs![0]!.name,
    )
    expect(pageErrors).toEqual([])
  })
})

test.describe('presence', () => {
  test('a live stream puts a count in the footer', async ({ page, api }) => {
    api.use('configured').presence(7)
    await page.goto('/')

    await expect(page.locator('footer')).toContainText('7')
  })

  test('an unreachable stream simply shows nothing', async ({ page, pageErrors }) => {
    // The default preset already aborts `/presence`. The composable gives up after
    // three failed connections rather than reconnecting for as long as the tab is
    // open, and the counter never appears — no error, no placeholder.
    await page.goto('/')

    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).not.toContainText('online')
    expect(pageErrors).toEqual([])
  })
})

/**
 * The rest of the live surface is only reachable from the terminal, which is
 * desktop-only by design — the launcher is `hidden md:flex` because a fixed input
 * panel fights a mobile virtual keyboard badly enough that no terminal beats a
 * broken one.
 */
test.describe('through the terminal', () => {
  test.skip(
    () => test.info().project.name === 'mobile',
    'There is deliberately no terminal on a phone.',
  )

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('weather: configured', async ({ terminal }) => {
    await terminal.open()
    await terminal.run('weather')
    await terminal.expectOutput(weatherConfigured.location!)
    await terminal.expectOutput(String(weatherConfigured.now!.temperature))
  })

  // `weather`, like `steam` and `gitlog`, memoises its first successful fetch for the
  // life of the page — the section and the command deliberately share one request
  // rather than each hitting the API. So a second run in the same page can only ever
  // show the first answer, and each state needs its own load. (`btc` is the exception
  // and says so in its own comment: running it is an explicit ask for a fresh price.)
  for (const preset of ['unconfigured', 'down'] as const) {
    test(`weather: ${preset}`, async ({ page, api, terminal, pageErrors }) => {
      api.use(preset)
      await page.reload()

      await terminal.open()
      await terminal.run('weather')
      await terminal.expectOutput('weather: unavailable')
      expect(pageErrors).toEqual([])
    })
  }

  test('markets: configured, unconfigured and down', async ({ api, terminal, pageErrors }) => {
    await terminal.open()
    await terminal.run('btc')
    await terminal.expectOutput(marketsConfigured.quotes![0]!.symbol)

    api.use('unconfigured')
    await terminal.run('btc')
    await terminal.expectOutput('btc: quotes unavailable')

    api.use('down')
    await terminal.run('btc')
    await terminal.expectOutput('btc: quotes unavailable')
    expect(pageErrors).toEqual([])
  })

  test('gitlog: configured', async ({ terminal }) => {
    await terminal.open()
    await terminal.run('gitlog')
    await terminal.expectOutput(githubActivityConfigured.commits![0]!.message)
  })

  test('gitlog: unreachable prints an honest line, not an error', async ({
    page,
    api,
    terminal,
    pageErrors,
  }) => {
    // `gitlog` shares the module-level cache the projects section fills on load, so
    // the state has to be chosen *before* the page mounts, not between two runs.
    api.use('down')
    await page.reload()

    await terminal.open()
    await terminal.run('gitlog')
    await terminal.expectOutput('no recent activity available')
    expect(pageErrors).toEqual([])
  })

  test('guestbook: enabled, disabled and down', async ({ api, terminal, pageErrors }) => {
    await terminal.open()
    await terminal.run('guestbook')
    // Entries are listed as filenames, not names — `cat guestbook/<file>` reads one.
    await terminal.expectOutput(filenameFor(guestbookConfigured.entries![0]!))

    api.use('unconfigured')
    await terminal.run('guestbook')
    // Off by default is a *deliberate* state, not a failure, and says so.
    await terminal.expectOutput('the guestbook is closed')

    api.use('down')
    await terminal.run('guestbook')
    await terminal.expectOutput('guestbook unavailable')
    expect(pageErrors).toEqual([])
  })

  test('guestbook entries are printed as text, never as markup', async ({ terminal }) => {
    const hostile = guestbookConfigured.entries![1]!

    await terminal.open()
    await terminal.run('guestbook')
    await terminal.run(`cat guestbook/${filenameFor(hostile)}`)

    // The one place the terminal renders something a stranger wrote. `OutputLine` is
    // plain text with tones — there is deliberately no markup escape hatch — so both
    // the name and the message have to survive as characters.
    await terminal.expectOutput(hostile.name)
    await terminal.expectOutput(hostile.message)
    await expect(terminal.output.locator('script, b')).toHaveCount(0)
  })
})
