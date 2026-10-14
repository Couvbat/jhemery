import { profile } from './profile'
import { canonicalPath, siteTitle } from './site'
import { toolInfo } from './tools'
import type { Localised } from './types'
import { views } from './views'
import { work } from './work'

/**
 * What every public page says to a search engine: its title, its heading and a
 * description, in both languages. The build reads it and the app doesn't (`site.ts` says
 * why); `vite-plugins/pages.ts` writes each page a copy of `index.html` with this head,
 * and `vite-plugins/discovery.ts` lists the pages in the sitemap.
 *
 * The app is one `index.html`, and before this list every route was served that file
 * as-is: `/tools/json`, `/work/qr` and `/now` all said they were the home page, down to
 * `<link rel="canonical" href="https://jhemery.xyz/">`. That is a canonical a crawler
 * obeys, so each one was folded into `/` however well the sitemap listed it.
 *
 * Titles are the tab's (`useTabTitle`), not new copy: `pages.spec.ts` holds every entry
 * to `tabTitle()` in both languages, and the list to `pagePaths`.
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

/** What each view is, for a search result. index.html carries the home page's in English. */
const VIEW_DESCRIPTIONS: Record<string, Localised> = {
  home: {
    en: 'Jules Hémery (Couvbat) — Full-Stack Developer at In-Leed, based in France. Portfolio with live GitHub/Steam activity, music production and a fully interactive terminal.',
    fr: 'Jules Hémery (Couvbat) — Développeur Full-Stack chez In-Leed, basé en France. Portfolio avec l’activité GitHub/Steam en direct, de la production musicale et un terminal entièrement interactif.',
  },
  tools: {
    en: 'Small developer tools that run entirely in your browser: images, hashes, Base64, JSON, JWT, regex, cron, QR codes, diffs and more. Nothing is uploaded.',
    fr: 'Petits outils de développeur qui tournent entièrement dans votre navigateur : images, hash, Base64, JSON, JWT, regex, cron, QR codes, diffs et plus. Rien n’est envoyé.',
  },
  watch: {
    en: 'A watch party: one room code, one YouTube video, and everyone at the same second. No accounts, and nothing is stored.',
    fr: 'Une soirée vidéo : un code de salon, une vidéo YouTube, et tout le monde à la même seconde. Sans compte, et rien n’est enregistré.',
  },
  radio: {
    en: 'A shared radio: the host queues SoundCloud tracks and YouTube videos, and every listener hears the same one at the same time.',
    fr: 'Une radio partagée : l’hôte enchaîne des morceaux SoundCloud et des vidéos YouTube, et chaque auditeur entend le même au même moment.',
  },
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
  {
    path: '/',
    title: siteTitle,
    heading: { en: `${profile.name} (${profile.alias})`, fr: `${profile.name} (${profile.alias})` },
    description: VIEW_DESCRIPTIONS.home!,
  },
  ...views.filter((view) => view !== home).map((view) => page(view.path, view.heading, VIEW_DESCRIPTIONS[view.id]!)),
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
      en: 'Everything this site stores in your browser, what each piece is for, and a way to clear it. None of it is a cookie. Also who handles your data, and your rights under the GDPR.',
      fr: 'Tout ce que ce site stocke dans votre navigateur, à quoi sert chaque élément, et de quoi l’effacer. Rien de tout cela n’est un cookie. Et qui traite vos données, et vos droits au titre du RGPD.',
    },
  ),
  page(
    '/legal',
    { en: 'Legal notice', fr: 'Mentions légales' },
    {
      en: 'Who publishes this site, who hosts it, the guestbook’s rules and how to report an entry, and credits for the data sources and open-source code it uses.',
      fr: 'Qui publie ce site, qui l’héberge, les règles du livre d’or et comment signaler un message, et les crédits des sources de données et du code open source utilisés.',
    },
  ),
  page(
    '/security',
    { en: 'Reporting a security problem', fr: 'Signaler un problème de sécurité' },
    {
      en: 'How to report a security problem with this site or its API: what counts, what doesn’t, how to write, what happens next, and a good-faith testing clause.',
      fr: 'Comment signaler un problème de sécurité sur ce site ou son API : ce qui compte, ce qui ne compte pas, comment écrire, ce qui se passe ensuite, et une clause de test de bonne foi.',
    },
  ),
  ...work.map((part) => page(`/work/${part.id}`, part.name, part.summary)),
]

/** The page a path stands for, as `canonicalPath` reads it. */
export function pageFor(path: string): PageMeta | undefined {
  const found = canonicalPath(path)
  return pages.find((entry) => entry.path === found)
}
