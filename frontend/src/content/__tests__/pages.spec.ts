import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { tabTitle } from '@/composables/useTabTitle'
import { setLocale } from '@/i18n'
import { LOCALES, pageFile, pageShell } from '../../../vite-plugins/pages'
import { pageFor, pages, pageUrl, siteTitle } from '../pages'
import { profile } from '../profile'
import type { Locale } from '../types'

/**
 * Each public page's static head (`vite-plugins/pages.ts`), in each language, against
 * what it has to agree with: the tab title the app sets once it runs, the other
 * language's URL, and `index.html`, which every copy is made from.
 */

const site = `https://${profile.domain}`
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const home = pages[0]!

/** The `content` of `<meta {attribute}="{key}">`, or the text of a tag. */
const metaOf = (html: string, attribute: string, key: string) =>
  new RegExp(`<meta ${attribute}="${key}" content="([^"]*)">`).exec(html)?.[1]
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1]
const canonicalOf = (html: string) => /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1]
const alternateOf = (html: string, hreflang: string) =>
  new RegExp(`<link rel="alternate" hreflang="${hreflang}" href="([^"]*)">`).exec(html)?.[1]
const unescape = (text: string) => text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/** Every page in every language. */
const copies = pages.flatMap((page) => LOCALES.map((locale) => [page.path, locale, page] as const))

afterEach(() => setLocale('en'))

describe('the pages', () => {
  // The English home page's copy would be index.html; if it isn't, the two disagree about
  // the site, and every other copy inherits whichever half of it the plugin rewrote.
  it('starts from the home page, whose English copy is index.html itself', () => {
    expect(home.path).toBe('/')
    expect(pageFile('/', 'en')).toBe('index.html')
    expect(pageShell(indexHtml, home, 'en')).toBe(indexHtml)
    expect(unescape(titleOf(indexHtml)!)).toBe(siteTitle.en)
  })

  it('has one entry per path', () => {
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length)
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

describe('pageUrl', () => {
  it('is the bare path in English and adds ?lang=fr in French', () => {
    expect(pageUrl('/tools/json', 'en')).toBe(`${site}/tools/json`)
    expect(pageUrl('/tools/json', 'fr')).toBe(`${site}/tools/json?lang=fr`)
    expect(pageUrl('/', 'fr')).toBe(`${site}/?lang=fr`)
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
  it.each(copies)('%s in %s names itself everywhere index.html names home', (path, locale, page) => {
    const html = pageShell(indexHtml, page, locale)
    const url = pageUrl(path, locale)
    expect(html).toContain(`<html lang="${locale}">`)
    expect(unescape(titleOf(html)!)).toBe(page.title[locale])
    expect(canonicalOf(html)).toBe(url)
    expect(metaOf(html, 'property', 'og:url')).toBe(url)
    for (const [attribute, key] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']]) {
      expect(unescape(metaOf(html, attribute!, key!)!), key).toBe(page.description[locale])
    }
    for (const [attribute, key] of [['property', 'og:title'], ['name', 'twitter:title']]) {
      expect(unescape(metaOf(html, attribute!, key!)!), key).toBe(page.title[locale])
    }
    expect(unescape(/<noscript>[\s\S]*?<h1>([^<]*)<\/h1>/.exec(html)![1]!)).toBe(page.heading[locale])
    if (path !== '/') expect(html).not.toContain(`href="${site}/"`)
  })

  it.each(copies)('%s in %s names both languages, English as the default', (path, locale, page) => {
    const html = pageShell(indexHtml, page, locale)
    const other: Locale = locale === 'en' ? 'fr' : 'en'
    expect(alternateOf(html, 'en')).toBe(pageUrl(path, 'en'))
    expect(alternateOf(html, 'fr')).toBe(pageUrl(path, 'fr'))
    expect(alternateOf(html, 'x-default')).toBe(pageUrl(path, 'en'))
    expect(metaOf(html, 'property', 'og:locale')).toBe(locale === 'en' ? 'en_US' : 'fr_FR')
    expect(metaOf(html, 'property', 'og:locale:alternate')).toBe(other === 'en' ? 'en_US' : 'fr_FR')
  })

  it('files each copy by language', () => {
    expect(pageFile('/tools/json', 'en')).toBe('pages/tools/json.html')
    expect(pageFile('/tools/json', 'fr')).toBe('pages/fr/tools/json.html')
    expect(pageFile('/', 'fr')).toBe('pages/fr/index.html')
  })

  it('changes nothing else', () => {
    const page = pageFor('/tools/json')!
    const changed = (html: string) =>
      html
        .split('\n')
        .filter(
          (line) =>
            !/<html lang|<title>|name="description"|rel="canonical"|rel="alternate"|og:url|og:title|og:description|og:image:alt|og:locale|twitter:title|twitter:description|twitter:image:alt|<h1>|<p>/.test(
              line,
            ),
        )
    for (const locale of LOCALES) expect(changed(pageShell(indexHtml, page, locale))).toEqual(changed(indexHtml))
  })

  it('escapes what it writes into an attribute', () => {
    const html = pageShell(indexHtml, { ...pageFor('/tools')!, description: { en: 'a "quoted" <b>& more', fr: '' } }, 'en')
    expect(html).toContain('<meta name="description" content="a &quot;quoted&quot; &lt;b&gt;&amp; more">')
  })

  // A tag index.html lost, or gained twice, would ship a page that is still the home page.
  it('fails the build when index.html does not have a tag exactly once', () => {
    const page = pageFor('/tools')!
    expect(() => pageShell(indexHtml.replace(/<link rel="canonical"[^>]*>/, ''), page, 'en')).toThrow(/0 canonical link/)
    const doubled = indexHtml.replace(/(<meta property="og:url"[^>]*>)/, '$1\n$1')
    expect(() => pageShell(doubled, page, 'en')).toThrow(/2 <meta property="og:url">/)
    expect(() => pageShell(indexHtml.replace(/<link rel="alternate" hreflang="fr"[^>]*>/, ''), page, 'fr')).toThrow(
      /0 hreflang="fr" link/,
    )
  })
})
