import { profile } from './profile'
import { toolInfo } from './tools'
import type { Localised } from './types'
import { viewFor, views } from './views'
import { work } from './work'

/**
 * Every public page a search engine should list, with what it should say about it.
 *
 * The app is one `index.html`, and before this list every route was served that file
 * as-is: `/tools/json`, `/work/qr` and `/now` all said they were the home page, down to
 * `<link rel="canonical" href="https://jhemery.xyz/">`. That is a canonical a crawler
 * obeys, so each one was folded into `/` however well the sitemap listed it. Now
 * `vite-plugins/pages.ts` writes each page its own copy of `index.html` with the head
 * below, and `usePageMeta` keeps the same head in step as the visitor moves around.
 *
 * Titles are the tab's (`useTabTitle`), not new copy: `pages.spec.ts` holds every entry
 * to `tabTitle()` in both languages, and every URL in the sitemap to an entry here.
 */
export interface PageMeta {
  /** The route path, with no trailing slash. */
  path: string
  /** The `<title>`: the page's heading, then the site's owner. */
  title: Localised
  /** What the page is, on its own: the heading a crawler without JavaScript reads. */
  heading: Localised
  description: Localised
}

/** Markdown code spans read as stray backticks in a search result. */
function plain(text: Localised): Localised {
  return { en: text.en.replace(/`/g, ''), fr: text.fr.replace(/`/g, '') }
}

function titled(heading: Localised): Localised {
  return { en: `${heading.en} — ${profile.name}`, fr: `${heading.fr} — ${profile.name}` }
}

function page(path: string, heading: Localised, description: Localised): PageMeta {
  return { path, title: titled(heading), heading, description: plain(description) }
}

/** The tagline without its full stop: the home page's title, and the 404's. */
export const siteTitle: Localised = {
  en: profile.tagline.en.replace(/\.$/, ''),
  fr: profile.tagline.fr.replace(/\.$/, ''),
}

const home = views.find((view) => view.id === 'home')!

/**
 * A tool's own description is a line under its name on the tools page. Alone in a search
 * result it needs the one thing that page's subtitle says for all of them.
 */
const TOOL_SUFFIX: Localised = {
  en: 'Free, and it runs in your browser: nothing is uploaded.',
  fr: 'Gratuit, et tout se passe dans votre navigateur : rien n’est envoyé.',
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

export const pages: PageMeta[] = [
  { path: '/', title: siteTitle, heading: { en: profile.name, fr: profile.name }, description: home.description },
  ...views.filter((view) => view !== home).map((view) => page(view.path, view.heading, view.description)),
  ...toolInfo
    .filter((tool) => tool.tier !== 'admin')
    .map((tool) =>
      page(`/tools/${tool.id}`, tool.name, {
        en: `${sentence(tool.description.en)} ${TOOL_SUFFIX.en}`,
        fr: `${sentence(tool.description.fr)} ${TOOL_SUFFIX.fr}`,
      }),
    ),
  page(
    '/now',
    { en: 'What I’m doing now', fr: 'Ce que je fais en ce moment' },
    {
      en: 'What I’m building, playing, learning and listening to at the moment: a dated /now page that says so when it goes stale.',
      fr: 'Ce que je construis, ce à quoi je joue, ce que j’apprends et ce que j’écoute en ce moment : une page /now datée, qui le dit quand elle vieillit.',
    },
  ),
  page(
    '/privacy',
    { en: 'What this site keeps', fr: 'Ce que ce site garde' },
    {
      en: 'Everything this site stores in your browser, what each piece is for, and a way to clear it. None of it is a cookie.',
      fr: 'Tout ce que ce site stocke dans votre navigateur, à quoi sert chaque élément, et de quoi l’effacer. Rien de tout cela n’est un cookie.',
    },
  ),
  ...work.map((part) => page(`/work/${part.id}`, part.name, part.summary)),
]

/**
 * The page a path stands for: its own entry, or the view it sits under, so a room code
 * or a tool that doesn't exist points crawlers at `/watch` or `/tools`. Nothing for the
 * 404 or an unknown case study, which tell crawlers not to index them instead.
 */
export function pageFor(path: string): PageMeta | undefined {
  // The router matches without regard to case, so `/Tools/JSON` is the JSON tool too.
  const clean = path.toLowerCase().replace(/\/+$/, '') || '/'
  return pages.find((entry) => entry.path === clean) ?? pages.find((entry) => entry.path === viewFor(clean)?.path)
}
