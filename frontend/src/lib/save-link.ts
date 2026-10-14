/**
 * A save link (`/privacy#save=…`, `save-file.ts`) lands here first: `main.ts` imports this
 * module before anything else, and it acts as it loads. The fragment never reaches the
 * server in a request, but a tracker reading `location.href` would send it on, and so would
 * a copy of the address bar. So the code is taken out of the address at once and held until
 * `/privacy` asks for it. On load rather than from `main.ts`'s body, because the router
 * reads the address when its module is evaluated, which is before that body runs, and would
 * write the fragment back on its first navigation. Its own module, with nothing imported,
 * because it runs on every page and the save file's code shouldn't.
 */

export const SAVE_MARKER = '#save='

let pending: string | null = null

export function takeSaveFromUrl(): void {
  const { pathname, search, hash } = window.location
  if (!hash.startsWith(SAVE_MARKER)) return
  pending = hash.slice(SAVE_MARKER.length)
  window.history.replaceState(window.history.state, '', `${pathname}${search}`)
}

/** The code a link brought, once: a second read gets nothing. */
export function pendingSave(): string | null {
  const code = pending
  pending = null
  return code
}

if (typeof window !== 'undefined') takeSaveFromUrl()
