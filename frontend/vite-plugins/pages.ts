import type { Plugin } from 'vite'
import { pages, type PageMeta } from '../src/content/pages'
import { pageUrl } from '../src/content/site'
import type { Locale, Localised } from '../src/content/types'
import { escapeHtml } from './markdown'

/**
 * One copy of the built `index.html` per public page (`src/content/pages.ts`) and per
 * language, with that page's title, description, canonical URL, language alternates and
 * link-preview tags: `pages/<path>.html` in English and `pages/fr/<path>.html` in French.
 * `.htaccess` serves `/tools/json` from the first and `/tools/json?lang=fr` from the
 * second where the file exists, and falls back to `index.html` where it doesn't, so a
 * crawler or a link preview, which runs no script, reads the page it asked for rather
 * than the home page. The app boots the same from any of them.
 *
 * Each tag is replaced where `index.html` has it, and a tag that isn't there exactly once
 * fails the build: a renamed or doubled tag would otherwise ship a page that still says
 * it is the home page, which is the bug this exists to fix. The English home page's copy
 * would be `index.html` itself, and `pages.spec.ts` holds it to that, so the two cannot
 * describe the site differently.
 *
 * `index.html` explains none of this in comments, because it is the one document every
 * visitor downloads and the Lighthouse byte budget counts it. The same goes for its
 * JSON-LD, which every copy carries as it is: `WebSite` is where Google takes the site
 * name it prints above a result (otherwise it guesses from the domain), and `Person` is
 * who the site is about.
 */

export const LOCALES: Locale[] = ['en', 'fr']

/** `pages/tools/json.html` for `/tools/json`, `pages/fr/tools/json.html` in French. */
export function pageFile(path: string, locale: Locale): string {
  if (locale === 'en') return path === '/' ? 'index.html' : `pages${path}.html`
  return `pages/${locale}${path === '/' ? '/index' : path}.html`
}

/** What `index.html` says the same way on every page, in each language. */
const CHROME = {
  ogLocale: { en: 'en_US', fr: 'fr_FR' },
  // The picture's own text is English: the alt says what it reads, in the page's language.
  imageAlt: {
    en: 'A terminal window reading: couvbat@portfolio:~$ whoami — Jules Hémery, Full-Stack Developer · Musician · Gamer.',
    fr: 'Une fenêtre de terminal où on lit : couvbat@portfolio:~$ whoami — Jules Hémery, Full-Stack Developer · Musician · Gamer.',
  },
  javascript: {
    en: 'This site is an interactive, JavaScript-rendered experience — enable JavaScript for the full version, including a hidden terminal.',
    fr: 'Ce site est une expérience interactive, rendue en JavaScript : activez-le pour la version complète, terminal caché compris.',
  },
} satisfies Record<string, Localised>

/** What to look for in `index.html`, and what to put there instead. */
type Tag = [what: string, pattern: RegExp, replacement: (match: RegExpExecArray) => string]

function replaceOnce(html: string, [what, pattern, replacement]: Tag): string {
  const found = html.match(new RegExp(pattern.source, 'g'))?.length ?? 0
  if (found !== 1) {
    throw new Error(`vite-plugins/pages.ts: index.html has ${found} ${what}, where one was expected`)
  }
  const match = pattern.exec(html)!
  return html.slice(0, match.index) + replacement(match) + html.slice(match.index + match[0].length)
}

function meta(attribute: 'name' | 'property', key: string, value: string): Tag {
  return [
    `<meta ${attribute}="${key}">`,
    new RegExp(`<meta ${attribute}="${key}" content="[^"]*">`),
    () => `<meta ${attribute}="${key}" content="${value}">`,
  ]
}

function alternate(hreflang: string, href: string): Tag {
  return [
    `hreflang="${hreflang}" link`,
    new RegExp(`<link rel="alternate" hreflang="${hreflang}" href="[^"]*">`),
    () => `<link rel="alternate" hreflang="${hreflang}" href="${href}">`,
  ]
}

/** `index.html` as `page` would have it, in `locale`. */
export function pageShell(html: string, page: PageMeta, locale: Locale): string {
  const say = (text: Localised) => escapeHtml(text[locale])
  const title = say(page.title)
  const description = say(page.description)
  const url = (lang: Locale) => escapeHtml(pageUrl(page.path, lang))
  const other = LOCALES.find((lang) => lang !== locale)!
  const tags: Tag[] = [
    ['<html lang>', /<html lang="[a-z]+">/, () => `<html lang="${locale}">`],
    ['<title>', /<title>[^<]*<\/title>/, () => `<title>${title}</title>`],
    meta('name', 'description', description),
    ['canonical link', /<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${url(locale)}">`],
    ...LOCALES.map((lang) => alternate(lang, url(lang))),
    // A visitor whose language is neither gets the English page.
    alternate('x-default', url('en')),
    meta('property', 'og:url', url(locale)),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:image:alt', say(CHROME.imageAlt)),
    meta('property', 'og:locale', CHROME.ogLocale[locale]),
    meta('property', 'og:locale:alternate', CHROME.ogLocale[other]),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image:alt', say(CHROME.imageAlt)),
    // What the `<noscript>` block says first: the page, then the line about JavaScript.
    // Its links stay as they are.
    [
      '<noscript> heading and first two paragraphs',
      /(<noscript>[\s\S]*?)<h1>[^<]*<\/h1>(\s*)<p>[^<]*<\/p>(\s*)<p>[^<]*<\/p>/,
      ([, before, gap, gap2]) =>
        `${before}<h1>${say(page.heading)}</h1>${gap}<p>${description}</p>${gap2}<p>${say(CHROME.javascript)}</p>`,
    ],
  ]
  return tags.reduce(replaceOnce, html)
}

export function pagesPlugin(): Plugin {
  return {
    name: 'jhemery:pages',
    apply: 'build',
    generateBundle: {
      // After Vite's own HTML plugin, which is what puts the built `index.html` here.
      order: 'post',
      handler(_, bundle) {
        const index = bundle['index.html']
        if (!index || index.type !== 'asset') this.error('vite-plugins/pages.ts: the bundle has no index.html')
        const html = String(index.source)
        for (const locale of LOCALES) {
          for (const page of pages) {
            const fileName = pageFile(page.path, locale)
            if (fileName === 'index.html') continue
            this.emitFile({ type: 'asset', fileName, source: pageShell(html, page, locale) })
          }
        }
      },
    },
  }
}
