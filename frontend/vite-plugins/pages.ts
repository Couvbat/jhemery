import type { Plugin } from 'vite'
import { pages, type PageMeta } from '../src/content/pages'
import { profile } from '../src/content/profile'
import { escapeHtml } from './markdown'

/**
 * One copy of the built `index.html` per public page (`src/content/pages.ts`), with that
 * page's title, description, canonical URL and link-preview tags, at `pages/<path>.html`.
 * `.htaccess` serves `/tools/json` from `pages/tools/json.html` where the file exists and
 * falls back to `index.html` where it doesn't, so a crawler, or a link preview, which
 * runs no script, reads the page it asked for rather than the home page. The app boots
 * the same from either.
 *
 * Each tag is replaced where `index.html` has it, and a tag that isn't there exactly once
 * fails the build: a renamed or doubled tag would otherwise ship a page that still says
 * it is the home page, which is the bug this exists to fix.
 */

const SITE = `https://${profile.domain}`

/** The shell's language: `index.html` is English, and so is every crawler's first visit. */
const LANG = 'en'

/** `pages/tools/json.html` for `/tools/json`. The home page is `index.html` itself. */
export function pageFile(path: string): string {
  return `pages${path}.html`
}

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

/** `index.html` as `page` would have it. */
export function pageShell(html: string, page: PageMeta): string {
  const title = escapeHtml(page.title[LANG])
  const description = escapeHtml(page.description[LANG])
  const url = escapeHtml(`${SITE}${page.path}`)
  const tags: Tag[] = [
    ['<title>', /<title>[^<]*<\/title>/, () => `<title>${title}</title>`],
    meta('name', 'description', description),
    ['canonical link', /<link rel="canonical" href="[^"]*">/, () => `<link rel="canonical" href="${url}">`],
    meta('property', 'og:url', url),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    // What the `<noscript>` block says first: the page, where index.html introduces the
    // site. Its links and the line about JavaScript stay as they are.
    [
      '<noscript> heading and first paragraph',
      /(<noscript>[\s\S]*?)<h1>[^<]*<\/h1>(\s*)<p>[^<]*<\/p>/,
      ([, before, gap]) => `${before}<h1>${escapeHtml(page.heading[LANG])}</h1>${gap}<p>${description}</p>`,
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
        for (const page of pages) {
          if (page.path === '/') continue
          this.emitFile({ type: 'asset', fileName: pageFile(page.path), source: pageShell(html, page) })
        }
      },
    },
  }
}
