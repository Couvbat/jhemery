import { expect, test } from './fixtures'
import { profile } from '@/content/profile'

/**
 * The files the SPA fallback must not swallow.
 *
 * A single-page app answers every unknown path with `index.html`. That is what makes
 * `/definitely-not-a-page` render the 404 view — and it is also exactly how
 * `/resume.txt` quietly starts serving a web page instead of a résumé. Two separate
 * mechanisms guard against it (`navigateFallbackDenylist` in the service worker, and
 * the Apache rewrite in `public/.htaccess`), and neither has a unit test, because
 * neither exists in the module graph.
 *
 * Requests here go through `request`, not `page.goto` — this is about what the server
 * hands back, not about what a renderer makes of it.
 */

const FILES = [
  { path: '/resume.txt', type: /text\/plain/ },
  { path: '/llms.txt', type: /text\/plain/ },
  { path: '/robots.txt', type: /text\/plain/ },
  { path: '/THIRD-PARTY.txt', type: /text\/plain/ },
  { path: '/sitemap.xml', type: /xml/ },
  { path: '/manifest.webmanifest', type: /(manifest|json)/ },
] as const

test.describe('static files', () => {
  for (const file of FILES) {
    test(`${file.path} is served as itself`, async ({ request }) => {
      const response = await request.get(file.path)

      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(file.type)
      // The failure this is really watching for: a 200 that is secretly the SPA
      // shell. A status code alone would not catch it.
      expect(await response.text()).not.toContain('<!DOCTYPE html>')
    })
  }
})

test.describe('the résumé', () => {
  /**
   * `/resume.txt` is generated at build time by `vite-plugins/resume.ts` from
   * `src/content/`, which is the whole point: the CV has exactly one source, and the
   * terminal's `curl` serves the same bytes. If this drifts, the site and the résumé
   * are telling different stories about the same person.
   */
  test('is generated from the content modules', async ({ request }) => {
    const body = await (await request.get('/resume.txt')).text()

    expect(body).toContain(profile.name)
    expect(body).toContain(profile.email)
    expect(body).toContain(profile.role.en)
  })

  test('reads the same through the terminal', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'No terminal on a phone.')

    await page.goto('/')
    await terminal.open()
    await terminal.run('curl /resume.txt')

    await terminal.expectOutput(profile.name)
  })
})

test.describe('discoverability', () => {
  test('sitemap and robots point at the real host', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    const robots = await (await request.get('/robots.txt')).text()

    expect(sitemap).toContain(profile.domain)
    expect(robots.toLowerCase()).toContain('sitemap')
  })

  test('the PWA manifest describes this app', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      name: string
      icons: { src: string }[]
      start_url: string
    }

    expect(manifest.name).toContain(profile.name)
    expect(manifest.start_url).toBe('/')
    expect(manifest.icons.length).toBeGreaterThan(0)

    // Every icon it advertises has to actually exist — a manifest referencing a
    // missing file installs an app with a blank icon and no error anywhere.
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200)
    }
  })
})
