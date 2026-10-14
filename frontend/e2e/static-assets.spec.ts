import { expect, test } from './fixtures'
import { pages } from '@/content/pages'
import { pageUrl } from '@/content/site'
import { profile } from '@/content/profile'
import { LOCALES, pageFile } from '../vite-plugins/pages'

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
  // The calendar feeds (vite-plugins/calendar.ts), which an app subscribes to.
  { path: '/events.ics', type: /text\/calendar/ },
  { path: '/events.fr.ics', type: /text\/calendar/ },
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

test.describe('the design notes', () => {
  /**
   * The notes are HTML documents of their own (`vite-plugins/notes.ts`), so the check
   * above, that the body is not a document, can't tell them from the SPA shell. What
   * can: the shell's `#app`, which a note never has.
   */
  for (const path of ['/notes/', '/notes/ctf-flag-chain']) {
    test(`${path} is the note, not the app`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(/text\/html/)
      const html = await response.text()
      expect(html).not.toContain('id="app"')
      expect(html).toContain('<link rel="stylesheet" href="/notes.css">')
    })
  }

  test('their stylesheet is served as itself', async ({ request }) => {
    const response = await request.get('/notes.css')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/text\/css/)
  })
})

test.describe('the résumé', () => {
  /**
   * `/resume.txt` is generated at build time by `vite-plugins/resume.ts` from
   * `src/content/`, which is the whole point: the CV has exactly one source, and the
   * terminal's `curl` fetches the very same file. If this drifts, the site and the
   * résumé are telling different stories about the same person.
   */
  test('is generated from the content modules', async ({ request }) => {
    const body = await (await request.get('/resume.txt')).text()

    expect(body).toContain(profile.name)
    expect(body).toContain(profile.email)
    expect(body).toContain(profile.role.en)
  })

  // `.htaccess` hands these to curl for `/neofetch` and friends; `vite preview` can't
  // run that rewrite, so this checks the files themselves (and the live check in
  // docs/deploy.md the rest).
  test('the curl pages are real files, each locale with its index', async ({ request }) => {
    for (const locale of ['en', 'fr']) {
      const res = await request.get(`/run/${locale}/help.txt`)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('text/plain')
      expect(await res.text()).toContain(`curl ${profile.domain}/neofetch`)
    }
  })

  // `curl -s jhemery.xyz/jules.1 | man -l -`: roff, in both languages, from the content.
  test('jules.1 and jules.fr.1 are manual pages, not the app', async ({ request }) => {
    for (const [file, heading] of [['jules.1', '.SH NAME'], ['jules.fr.1', '.SH NOM']]) {
      const body = await (await request.get(`/${file}`)).text()
      expect(body.startsWith('.TH JULES 1 '), file).toBe(true)
      expect(body, file).toContain(heading)
    }
  })

  test('reads the same through the terminal', async ({ page, terminal }) => {
    test.skip(test.info().project.name === 'mobile', 'Typed at the prompt, which a phone doesn’t have: its touch layout runs the same commands (tap-shell.spec.ts).')

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

  // Each public page's copy of index.html (`vite-plugins/pages.ts`), which `.htaccess`
  // serves for its route. `vite preview` can't run that rewrite, so this checks the files
  // it points at, and docs/deploy.md the live one. The copy must still be the app, and
  // load the same build as index.html does.
  test('every public page has a copy of the app that names it, in each language', async ({ request }) => {
    const script = /<script type="module" crossorigin src="([^"]+)">/
    const app = script.exec(await (await request.get('/')).text())?.[1]
    expect(app).toBeTruthy()
    for (const locale of LOCALES) {
      for (const page of pages) {
        const file = pageFile(page.path, locale)
        const response = await request.get(`/${file}`)
        expect(response.status(), file).toBe(200)
        const html = await response.text()
        expect(script.exec(html)?.[1], file).toBe(app)
        expect(html, file).toContain(`<html lang="${locale}">`)
        expect(html, file).toContain(`<link rel="canonical" href="${pageUrl(page.path, locale)}">`)
      }
    }
  })

  // Generated from the content at build time now (vite-plugins/discovery.ts), so these are
  // the files the build wrote, not ones copied from public/.
  test('the sitemap lists both languages, and llms.txt the tools', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain(`<loc>${pageUrl('/tools/json', 'fr')}</loc>`)
    const llms = await (await request.get('/llms.txt')).text()
    expect(llms).toContain(`](${pageUrl('/tools/json', 'en')})`)
    expect(llms).not.toContain('{{')
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
