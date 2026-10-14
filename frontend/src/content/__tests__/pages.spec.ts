import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { tabTitle } from '@/composables/useTabTitle'
import { setLocale } from '@/i18n'
import { pageFile, pageShell } from '../../../vite-plugins/pages'
import { pageFor, pages, siteTitle } from '../pages'
import { profile } from '../profile'
import { views } from '../views'

/**
 * Each public page's static head (`vite-plugins/pages.ts`) against the three things it
 * has to agree with: the tab title the app sets once it runs, the sitemap that sends
 * crawlers there, and `index.html`, which every copy is made from.
 */

const site = `https://${profile.domain}`
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const sitemap = readFileSync(join(process.cwd(), 'public/sitemap.xml'), 'utf8')
const copies = pages.filter((page) => page.path !== '/')

/** The `content` of `<meta {attribute}="{key}">`, or the text of a tag. */
const metaOf = (html: string, attribute: string, key: string) =>
  new RegExp(`<meta ${attribute}="${key}" content="([^"]*)">`).exec(html)?.[1]
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1]
const canonicalOf = (html: string) => /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1]
const unescape = (text: string) => text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

afterEach(() => setLocale('en'))

describe('the pages', () => {
  it('starts from the home page, which is index.html itself', () => {
    expect(pages[0]!.path).toBe('/')
    expect(unescape(titleOf(indexHtml)!)).toBe(siteTitle.en)
    expect(metaOf(indexHtml, 'name', 'description')).toBe(views[0]!.description.en)
    expect(canonicalOf(indexHtml)).toBe(`${site}/`)
  })

  it('has one entry per path', () => {
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length)
  })

  // Everything in the sitemap that the app answers, so not the notes or the résumés,
  // which are documents of their own.
  it('is exactly what the sitemap lists for the app', () => {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1]!.slice(site.length) || '/')
      .filter((path) => !path.startsWith('/notes/') && !path.startsWith('/resume'))
    expect(pages.map((page) => page.path).sort()).toEqual(listed.sort())
  })

  it.each(pages.map((page) => [page.path, page] as const))('%s is titled as its tab is', (path, page) => {
    expect(tabTitle(path)).toBe(page.title.en)
    setLocale('fr')
    expect(tabTitle(path)).toBe(page.title.fr)
  })

  it.each(pages.map((page) => [page.path, page] as const))('%s has a description in each language', (_, page) => {
    for (const text of [page.description.en, page.description.fr]) {
      expect(text.length).toBeGreaterThan(50)
      expect(text).not.toMatch(/`/)
    }
  })
})

describe('pageFor', () => {
  it('finds a page by its path, forgiving a trailing slash and case', () => {
    expect(pageFor('/tools/json')?.path).toBe('/tools/json')
    expect(pageFor('/tools/json/')?.path).toBe('/tools/json')
    expect(pageFor('/Tools/JSON')?.path).toBe('/tools/json')
    expect(pageFor('/')?.path).toBe('/')
  })

  it('points a room code or an unlisted tool at its view', () => {
    expect(pageFor('/watch/AB3DE')?.path).toBe('/watch')
    expect(pageFor('/radio/abcd')?.path).toBe('/radio')
    expect(pageFor('/tools/nope')?.path).toBe('/tools')
    // The owner's tool exists, but not for a crawler.
    expect(pageFor('/tools/download')?.path).toBe('/tools')
  })

  it('has nothing for the 404 or a case study that does not exist', () => {
    expect(pageFor('/definitely-not-a-page')).toBeUndefined()
    expect(pageFor('/work/nope')).toBeUndefined()
    expect(pageFor('/work')).toBeUndefined()
  })
})

describe('a page’s copy of index.html', () => {
  it.each(copies.map((page) => [page.path, page] as const))('%s names itself everywhere index.html names home', (path, page) => {
    const html = pageShell(indexHtml, page)
    const url = `${site}${path}`
    expect(unescape(titleOf(html)!)).toBe(page.title.en)
    expect(canonicalOf(html)).toBe(url)
    expect(metaOf(html, 'property', 'og:url')).toBe(url)
    for (const [attribute, key] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) {
      expect(unescape(metaOf(html, attribute!, key!)!), key).toBe(page.description.en)
    }
    for (const [attribute, key] of [['property', 'og:title'], ['name', 'twitter:title']]) {
      expect(unescape(metaOf(html, attribute!, key!)!), key).toBe(page.title.en)
    }
    expect(html).toContain(`<h1>${page.heading.en.replace(/&/g, '&amp;')}</h1>`)
    expect(html).not.toContain(`href="${site}/"`)
    expect(pageFile(path)).toBe(`pages${path}.html`)
  })

  it('changes nothing else', () => {
    const page = pageFor('/tools/json')!
    const changed = (html: string) =>
      html
        .split('\n')
        .filter((line) => !/<title>|name="description"|rel="canonical"|og:url|og:title|og:description|twitter:title|twitter:description|<h1>|<p>/.test(line))
    expect(changed(pageShell(indexHtml, page))).toEqual(changed(indexHtml))
  })

  it('escapes what it writes into an attribute', () => {
    const html = pageShell(indexHtml, { ...pageFor('/tools')!, description: { en: 'a "quoted" <b>& more', fr: '' } })
    expect(html).toContain('<meta name="description" content="a &quot;quoted&quot; &lt;b&gt;&amp; more">')
  })

  // A tag index.html lost, or gained twice, would ship a page that is still the home page.
  it('fails the build when index.html does not have a tag exactly once', () => {
    const page = pageFor('/tools')!
    expect(() => pageShell(indexHtml.replace(/<link rel="canonical"[^>]*>/, ''), page)).toThrow(/0 canonical link/)
    const doubled = indexHtml.replace(/(<meta property="og:url"[^>]*>)/, '$1\n$1')
    expect(() => pageShell(doubled, page)).toThrow(/2 <meta property="og:url">/)
  })
})
