import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { profile, viewFor } from '@/content'
import { useLocale } from '@/i18n'
import { resolvePath } from './useViewSwing'

/**
 * The tab title follows the view, and is decided here, once, from the route.
 *
 * It used to be each view's: save `document.title` on the way in, put it back on the
 * way out. The swing breaks that — the arriving page mounts while the leaving one is
 * still turning away, so it saved the *leaving* page's title as the one to restore,
 * and tools → watch → home ended on "Watch party". A title that is a function of the
 * route has no lifetimes to overlap.
 *
 * index.html's own title — the one the crawlers and the OG tags describe — is read
 * before any view can touch it, and stays the home page's and the 404's.
 */
const siteTitle = document.title

export function tabTitle(path: string, home: string = siteTitle): string {
  const view = viewFor(path)
  if (!view || view.id === 'home') return home

  const { t } = useLocale()
  // A tool that does not exist, or a code that is not one, resolves to nothing — the
  // page says so in its body, and the tab still names the view.
  const resolved = resolvePath(path)
  const found = resolved?.kind === 'view' ? resolved : undefined
  const name = found?.tool
    ? t(found.tool.name)
    : `${t(view.heading)}${found?.code ? ` · ${found.code}` : ''}`
  return `${name} — ${profile.name}`
}

/** Binds the title to the route. Called once, from `App.vue`. */
export function useTabTitle(): void {
  const route = useRoute()
  watchEffect(() => {
    document.title = tabTitle(route.path)
  })
}
