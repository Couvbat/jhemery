import { profile } from './profile'
import type { Localised } from './types'

/**
 * `/legal`: the mentions légales French law asks of every site (LCEN), and the credits the
 * site's sources ask for. A personal site, so the publisher is a private person, named
 * because the name is on every page anyway. Imported as `@/content/legal`, never through the
 * barrel, for the same first-paint reason as `privacy.ts`.
 */

export interface Company {
  name: string
  address: string
  phone?: string
  siren?: string
  url: string
}

/** The host the law asks to be named: the site, the API and the guestbook's file all live there. */
export const host: Company = {
  name: 'O2SWITCH SAS',
  address: 'Chemin des Pardiaux, 63000 Clermont-Ferrand, France',
  phone: '+33 4 44 44 60 40',
  siren: '510 909 807',
  url: 'https://www.o2switch.fr',
}

/** Not a host, but every request passes through it, so it is named beside the host. */
export const cdn: Company = {
  name: 'Cloudflare, Inc.',
  address: '101 Townsend St, San Francisco, CA 94107, USA',
  url: 'https://www.cloudflare.com',
}

export interface Credit {
  what: Localised
  who: string
  href: string
  licence?: { name: string; href: string }
}

/**
 * The version of `@ffmpeg/core` the ffmpeg tool serves, unmodified. It is GPL, so the credit
 * names the exact source it was built from; `legal.spec.ts` holds this to the installed file.
 *
 * The source is pinned by its own tag, not derived from the version: upstream tags the
 * monorepo by release, and `v0.12.10` holds core 0.12.6, while core 0.12.10 is under `v12.15`
 * (its `packages/core/package.json` says so; found in review). A bump fails the spec above,
 * and is the moment to look the new tag up the same way.
 */
export const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_SOURCE_TAG = 'v12.15'

const MIT = { name: 'MIT', href: 'https://opensource.org/license/mit' }

export const credits: Credit[] = [
  {
    what: { en: 'Weather', fr: 'Météo' },
    who: 'Open-Meteo.com',
    href: 'https://open-meteo.com/',
    licence: { name: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
  },
  {
    what: { en: 'Crypto prices', fr: 'Cours crypto' },
    who: 'CoinGecko',
    href: 'https://www.coingecko.com/en/api',
  },
  {
    what: { en: 'What I’m playing', fr: 'Ce à quoi je joue' },
    who: 'Steam Web API',
    href: 'https://steamcommunity.com/dev',
  },
  {
    what: { en: 'Commits, heatmap and builds', fr: 'Commits, heatmap et builds' },
    who: 'GitHub API',
    href: 'https://docs.github.com/en/rest',
  },
  {
    what: { en: 'The ffmpeg tool', fr: 'L’outil ffmpeg' },
    who: `ffmpeg.wasm (@ffmpeg/core ${FFMPEG_CORE_VERSION}, unmodified)`,
    href: `https://github.com/ffmpegwasm/ffmpeg.wasm/tree/${FFMPEG_SOURCE_TAG}/packages/core`,
    licence: { name: 'GPL-2.0-or-later', href: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html' },
  },
  { what: { en: 'The 3D background', fr: 'Le fond 3D' }, who: 'three.js', href: 'https://threejs.org/', licence: MIT },
  {
    what: { en: 'The interface', fr: 'L’interface' },
    who: 'Vue, Vue Router, VueUse, Reka UI, Tailwind CSS',
    href: 'https://vuejs.org/',
    licence: MIT,
  },
  { what: { en: 'Icons', fr: 'Icônes' }, who: 'Lucide', href: 'https://lucide.dev/', licence: { name: 'ISC', href: 'https://lucide.dev/license' } },
  { what: { en: 'The API', fr: 'L’API' }, who: 'NestJS', href: 'https://nestjs.com/', licence: MIT },
]

/** The page's headings, here rather than in `i18n/messages.ts` so they load with the page. */
export const legalHeadings = {
  publisher: { en: 'Publisher', fr: 'Éditeur' },
  host: { en: 'Hosting', fr: 'Hébergement' },
  guestbook: { en: 'Visitors’ messages', fr: 'Messages des visiteurs' },
  property: { en: 'Code and trademarks', fr: 'Code et marques' },
  credits: { en: 'Credits', fr: 'Crédits' },
  phone: { en: 'phone', fr: 'tél.' },
} satisfies Record<string, Localised>

export const legalCopy = {
  publisher: {
    en: `${profile.domain} is a personal, non-commercial site. Publisher and director of publication: ${profile.name}, as a private individual.`,
    fr: `${profile.domain} est un site personnel et non commercial. Édition et direction de la publication : ${profile.name}, à titre de particulier.`,
  },
  contact: {
    en: `Write to ${profile.email}, or use \`mail\` in the terminal.`,
    fr: `Écrivez à ${profile.email}, ou utilisez \`mail\` dans le terminal.`,
  },
  host: {
    en: 'The site, its API and the guestbook are hosted in France by:',
    fr: 'Le site, son API et le livre d’or sont hébergés en France par :',
  },
  cdn: {
    en: 'Every request passes through Cloudflare first, which shields the site and serves it faster:',
    fr: 'Chaque requête passe d’abord par Cloudflare, qui protège le site et le sert plus vite :',
  },
  guestbook: {
    en: 'The guestbook publishes what visitors write, under the name they give. Each entry is first read by a language model running on my own machine, which may hold it for me to review; nothing is sent to anyone else. I read it too, and remove without notice anything unlawful, hateful or harassing, any advertising, and anything that names or exposes someone else.',
    fr: 'Le livre d’or publie ce qu’écrivent les visiteurs, sous le nom qu’ils donnent. Chaque message est d’abord lu par un modèle de langage qui tourne sur ma propre machine, et qui peut le garder pour que je le relise ; rien n’est envoyé à qui que ce soit d’autre. Je le lis aussi, et je retire sans préavis tout ce qui est illicite, haineux ou harcelant, la publicité, et tout ce qui nomme ou expose quelqu’un d’autre.',
  },
  report: {
    en: `To report an entry, or to have one of yours removed, write to ${profile.email} with its name and date. I act on it as soon as I read it.`,
    fr: `Pour signaler un message, ou faire retirer l’un des vôtres, écrivez à ${profile.email} avec son nom et sa date. J’agis dès que je le lis.`,
  },
  code: {
    en: 'The site’s source code is public, under the MIT licence.',
    fr: 'Le code source du site est public, sous licence MIT.',
  },
  marks: {
    en: 'Steam, GitHub, SoundCloud, YouTube and the other names here belong to their owners. This site uses their public services and is not affiliated with or endorsed by any of them.',
    fr: 'Steam, GitHub, SoundCloud, YouTube et les autres noms cités appartiennent à leurs propriétaires. Ce site utilise leurs services publics, sans être affilié à aucun ni approuvé par eux.',
  },
  credits: {
    en: 'Where the live data comes from, and the open-source work the site is built on.',
    fr: 'D’où viennent les données en direct, et le travail open source sur lequel le site repose.',
  },
} satisfies Record<string, Localised>
