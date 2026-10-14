import { profile } from './profile'
import { toolInfo } from './tools'
import { LANG_PARAM, type Locale, type Localised } from './types'
import { viewFor, views } from './views'
import { work } from './work'

/**
 * The public pages as URLs: what the app needs at runtime to name a page to a search
 * engine (`usePageMeta`). What each page says, its title and description, is in
 * `pages.ts`, which the build reads and the app doesn't: every URL a crawler fetches comes
 * with its own static copy of the head (`vite-plugins/pages.ts`), so shipping the copy in
 * the bundle as well would cost every visitor bytes that no crawler reads from there.
 *
 * Each page exists in both languages, and each language has its own URL, since a search
 * engine indexes URLs, not settings: the English one is the bare path, the French one
 * adds `?lang=fr` (`pageUrl`). A query rather than a `/fr/` prefix, because the router,
 * the terminal's `cd` and every link in the app take paths, and none of them has to learn
 * a second form of each. The app reads the parameter as it loads (`i18n/index.ts`).
 */

export const SITE = `https://${profile.domain}`

/** The tagline without its full stop: the home page's title, and the 404's. */
export const siteTitle: Localised = {
  en: profile.tagline.en.replace(/\.$/, ''),
  fr: profile.tagline.fr.replace(/\.$/, ''),
}

/** The page's URL in a language. English is the default, so its URL is the bare path. */
export function pageUrl(path: string, locale: Locale): string {
  return `${SITE}${path}${locale === 'en' ? '' : `?${LANG_PARAM}=${locale}`}`
}

/** Every public page, by path: the views, the public tools, `/now`, `/privacy`, the case studies. */
export const pagePaths: string[] = [
  ...views.map((view) => view.path),
  ...toolInfo.filter((tool) => tool.tier !== 'admin').map((tool) => `/tools/${tool.id}`),
  '/now',
  '/privacy',
  ...work.map((part) => `/work/${part.id}`),
]

/**
 * The public page a path stands for: its own, or the view it sits one segment under, so a
 * room code or a tool that doesn't exist points crawlers at `/watch` or `/tools`. One
 * segment only, as the router's `/tools/:tool?` takes: `/tools/json/extra` is the 404.
 * Nothing for the 404 or an unknown case study, which tell crawlers not to index them.
 *
 * `/index.html` is the home page: the same file, which Apache serves at that address
 * too. The router has no route for it and shows the 404, so it would be `noindex`, but a
 * duplicate of a page is better pointed at it, which is what a canonical is for. It is
 * also the address Lighthouse CI opens, so the SEO gate reads the home page's head.
 */
export function canonicalPath(path: string): string | undefined {
  // The router matches without regard to case, so `/Tools/JSON` is the JSON tool too.
  const clean = path.toLowerCase().replace(/\/+$/, '').replace(/^\/index\.html$/, '') || '/'
  if (pagePaths.includes(clean)) return clean
  const view = viewFor(clean)
  if (!view || view.path === '/' || clean.slice(view.path.length + 1).includes('/')) return undefined
  return view.path
}
