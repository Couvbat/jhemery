import type { ViewMeta } from './types'

/**
 * The top-level destinations — the faces of the prism. Sections are anchors inside
 * `home`; this list sits one level above them, and it is the only one: the navbar, the
 * router, the terminal's `cd`/`ls`/`pwd`, the command palette and the view swing all
 * read it, exactly as they read `sections.ts` for what is inside the home page.
 *
 * **The order of the array is the order of the prism.** A swing's direction is the
 * sign of the index difference, so Back always unwinds what Forward wound.
 */
export const views: ViewMeta[] = [
  {
    id: 'home',
    path: '/',
    label: { en: 'home', fr: 'home' },
    prompt: 'cd ~',
    heading: { en: 'Home', fr: 'Accueil' },
    // index.html carries the English one, and `pages.spec.ts` holds the two together.
    description: {
      en: 'Jules Hémery (Couvbat) — Full-Stack Developer at In-Leed, based in France. Portfolio with live GitHub/Steam activity, music production and a fully interactive terminal.',
      fr: 'Jules Hémery (Couvbat) — Développeur Full-Stack chez In-Leed, basé en France. Portfolio avec l’activité GitHub/Steam en direct, de la production musicale et un terminal entièrement interactif.',
    },
  },
  {
    id: 'tools',
    path: '/tools',
    label: { en: 'tools', fr: 'tools' },
    prompt: 'ls ~/tools',
    heading: { en: 'Tools & utilities', fr: 'Outils & utilitaires' },
    description: {
      en: 'Small developer tools that run entirely in your browser: images, hashes, Base64, JSON, JWT, regex, cron, QR codes, diffs and more. Nothing is uploaded.',
      fr: 'Petits outils de développeur qui tournent entièrement dans votre navigateur : images, hash, Base64, JSON, JWT, regex, cron, QR codes, diffs et plus. Rien n’est envoyé.',
    },
  },
  {
    id: 'watch',
    path: '/watch',
    label: { en: 'watch', fr: 'watch' },
    prompt: 'open ~/watch',
    heading: { en: 'Watch party', fr: 'Soirée vidéo' },
    description: {
      en: 'A watch party: one room code, one YouTube video, and everyone at the same second. No accounts, and nothing is stored.',
      fr: 'Une soirée vidéo : un code de salon, une vidéo YouTube, et tout le monde à la même seconde. Sans compte, et rien n’est enregistré.',
    },
  },
  {
    id: 'radio',
    path: '/radio',
    label: { en: 'radio', fr: 'radio' },
    prompt: 'play ~/radio',
    heading: { en: 'Radio', fr: 'Radio' },
    description: {
      en: 'A shared radio: the host queues SoundCloud tracks and YouTube videos, and every listener hears the same one at the same time.',
      fr: 'Une radio partagée : l’hôte enchaîne des morceaux SoundCloud et des vidéos YouTube, et chaque auditeur entend le même au même moment.',
    },
  },
]

export const viewIds = views.map((v) => v.id)

/** Like `findSection`: by id or by either label, with stray slashes forgiven. */
export function findView(name: string): ViewMeta | undefined {
  const needle = name.toLowerCase().replace(/^\/+/, '').replace(/\/+$/, '')
  return views.find((v) => v.id === needle || v.label.en === needle || v.label.fr === needle)
}

/** The view a route path belongs to. `/` is `home` alone; every other view owns its
 *  sub-paths, so `/tools/image` is still the tools view. */
export function viewFor(path: string): ViewMeta | undefined {
  return views.find((v) =>
    v.path === '/' ? path === '/' : path === v.path || path.startsWith(`${v.path}/`),
  )
}

/** Position in the prism. Anything the router matched to the 404 sits after the last face. */
export function viewIndex(path: string): number {
  const view = viewFor(path)
  return view ? views.indexOf(view) : views.length
}
