import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { profile } from '@/content'
import { pageFor } from '@/content/pages'
import { useLocale } from '@/i18n'

/**
 * The head a search engine reads after running the page, kept to what the static copy of
 * that page said before it (`vite-plugins/pages.ts`). Google renders with JavaScript and
 * believes the rendered head, so a canonical that stayed `/` while the visitor, or the
 * renderer, moved to `/tools/json` would undo the copy. The copies only exist for a page
 * that loads first; everything after that is a client-side navigation, and this.
 *
 * The 404 and an unknown case study get `noindex` and lose the canonical. The server
 * answers them with a 200 (it is a single-page app), and a page that says "not found"
 * with a 200 is a soft 404 to Google, one it may still index.
 */
const SITE = `https://${profile.domain}`

function element(tag: 'link' | 'meta', key: 'rel' | 'name', value: string): HTMLElement {
  const found = document.head.querySelector<HTMLElement>(`${tag}[${key}="${value}"]`)
  if (found) return found
  const created = document.createElement(tag)
  created.setAttribute(key, value)
  document.head.append(created)
  return created
}

function remove(selector: string): void {
  document.head.querySelector(selector)?.remove()
}

export function applyPageMeta(path: string): void {
  const { t } = useLocale()
  const page = pageFor(path)
  if (page) {
    element('link', 'rel', 'canonical').setAttribute('href', `${SITE}${page.path}`)
    element('meta', 'name', 'description').setAttribute('content', t(page.description))
    remove('meta[name="robots"]')
  } else {
    remove('link[rel="canonical"]')
    element('meta', 'name', 'robots').setAttribute('content', 'noindex')
  }
}

/** Binds the head to the route and the locale. Called once, from `App.vue`. */
export function usePageMeta(): void {
  const route = useRoute()
  watchEffect(() => applyPageMeta(route.path))
}
