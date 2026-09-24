import type { Router } from 'vue-router'
import { openTerminalFromLink } from './useTerminalShell'

/**
 * `?run=<command>` — a link that opens the shell and runs one command. The check that
 * the command may be run this way happens in the terminal's own chunk (`runLink`),
 * since this module is eager and must not pull the registry in; here we only read
 * the parameter, drop it, and hand it over.
 *
 * Desktop only, at the launcher's own breakpoint: below it there is no terminal
 * (`TerminalLauncher.vue`), so the parameter is ignored and the page loads normally.
 * It is dropped from the URL once read, so a reload or a bookmark does not run it
 * again and a copied address does not carry it on.
 */
export const DESKTOP_QUERY = '(min-width: 768px)'

export async function consumeRunParam(router: Pick<Router, 'isReady' | 'currentRoute' | 'replace'>): Promise<void> {
  await router.isReady()
  const route = router.currentRoute.value
  const raw = route.query.run
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value.trim()) return
  if (typeof window.matchMedia !== 'function' || !window.matchMedia(DESKTOP_QUERY).matches) return

  const query = { ...route.query }
  delete query.run
  await router.replace({ path: route.path, hash: route.hash, query })
  openTerminalFromLink(value)
}
