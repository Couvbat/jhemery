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
  },
  {
    id: 'tools',
    path: '/tools',
    label: { en: 'tools', fr: 'tools' },
    prompt: 'ls ~/tools',
    heading: { en: 'Tools & utilities', fr: 'Outils & utilitaires' },
  },
  {
    id: 'watch',
    path: '/watch',
    label: { en: 'watch', fr: 'watch' },
    prompt: 'open ~/watch',
    heading: { en: 'Watch party', fr: 'Soirée vidéo' },
  },
  {
    id: 'radio',
    path: '/radio',
    label: { en: 'radio', fr: 'radio' },
    prompt: 'play ~/radio',
    heading: { en: 'Radio', fr: 'Radio' },
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
