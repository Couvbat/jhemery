import { watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { pageFor, pageUrl } from '@/content/pages'
import { LANG_PARAM, type Locale } from '@/content/types'
import { useLocale } from '@/i18n'

/**
 * The head a search engine reads after running the page, kept to what the static copy of
 * that page said before it (`vite-plugins/pages.ts`). Google renders with JavaScript and
 * believes the rendered head, so a canonical that stayed `/` while the visitor, or the
 * renderer, moved to `/tools/json` would undo the copy. The copies only exist for a page
 * that loads first; everything after that is a client-side navigation, and this.
 *
 * The canonical is the URL of the page in the language it is showing (`?lang=fr` for
 * French), with both languages' URLs as alternates, as the copies have them.
 *
 * The 404 and an unknown case study get `noindex` and lose the canonical. The server
 * answers them with a 200 (it is a single-page app), and a page that says "not found"
 * with a 200 is a soft 404 to Google, one it may still index.
 */

const LOCALES: Locale[] = ['en', 'fr']
const HREFLANGS = [...LOCALES, 'x-default'] as const

function element(tag: 'link' | 'meta', attributes: Record<string, string>): HTMLElement {
  const selector = `${tag}${Object.entries(attributes)
    .map(([key, value]) => `[${key}="${value}"]`)
    .join('')}`
  const found = document.head.querySelector<HTMLElement>(selector)
  if (found) return found
  const created = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) created.setAttribute(key, value)
  document.head.append(created)
  return created
}

function removeAll(selector: string): void {
  for (const node of document.head.querySelectorAll(selector)) node.remove()
}

export function applyPageMeta(path: string): void {
  const { t, locale } = useLocale()
  const page = pageFor(path)
  if (!page) {
    removeAll('link[rel="canonical"], link[rel="alternate"][hreflang]')
    element('meta', { name: 'robots' }).setAttribute('content', 'noindex')
    return
  }
  element('link', { rel: 'canonical' }).setAttribute('href', pageUrl(page.path, locale.value))
  for (const hreflang of HREFLANGS) {
    const lang = hreflang === 'x-default' ? 'en' : hreflang
    element('link', { rel: 'alternate', hreflang }).setAttribute('href', pageUrl(page.path, lang))
  }
  element('meta', { name: 'description' }).setAttribute('content', t(page.description))
  removeAll('meta[name="robots"]')
}

/** Binds the head to the route and the locale. Called once, from `App.vue`. */
export function usePageMeta(): void {
  const route = useRoute()
  const router = useRouter()
  const { locale } = useLocale()
  watchEffect(() => applyPageMeta(route.path))

  // `?lang=fr` is read once, as the app loads (`i18n/index.ts`). Left in the address after
  // the visitor switches to English, it would put them back in French on a reload, so it
  // goes; the stored choice carries the language from then on.
  watch(locale, (next) => {
    const asked = route.query[LANG_PARAM]
    if (asked === undefined || asked === next) return
    const query = { ...route.query }
    delete query[LANG_PARAM]
    void router.replace({ path: route.path, hash: route.hash, query })
  })
}
