import { nextTick, ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { paletteOpen } from './usePalette'
import { pageLabel } from './useTabTitle'
import { terminalOpen } from './useTerminalShell'
import { useViewSwing } from './useViewSwing'

/**
 * Accessible page changes (roadmap §H, features-spec §9). An SPA swaps its page without
 * the browser saying so: a screen reader stays wherever it was — often on a navbar link
 * of a page that is gone — and hears nothing. So once a change of face has settled (the
 * swing over, or the pages swapped at once), focus moves to the new page's heading and
 * one `role="status"` node in `App.vue` says where the visitor is now.
 *
 * - **With a hash** (`/#contact` from another page), the section's own heading takes
 *   focus, with `preventScroll`: `useViewSwing` has just scrolled there itself.
 * - **Otherwise** the arriving page's `<h1>`, found as the one in the `<main>` that is
 *   not `inert` — the leaving face is `inert` for its turn, and gone by now anyway.
 *
 * Not while the terminal or the palette is open: the visitor is typing there, and a page
 * changing behind them is not a reason to take the keyboard away. The first navigation
 * never counts (the page has only just loaded, and focus starts at its top), nor does a
 * change inside one face.
 */

/** What the status node says. Cleared, then set, so the same page twice is heard twice. */
export const pageAnnouncement = ref('')

/** Every view's heading is `tabindex="-1"` (a spec holds them to it), so it can take focus. */
const HEADING = '.view-stage main:not([inert]) h1'

function heading(hash: string): HTMLElement | null {
  if (!hash) return document.querySelector<HTMLElement>(HEADING)
  // Raw, as `scrollToSection` reads it: section ids are plain words, and decoding a hash
  // someone typed can throw.
  const section = document.getElementById(hash.slice(1))
  // A hash that names no section still leaves the visitor on a page with a heading.
  return section?.querySelector<HTMLElement>('h1, h2') ?? document.querySelector<HTMLElement>(HEADING)
}

/** Called once, from `App.vue`. */
export function usePageFocus(router: Pick<Router, 'currentRoute'>): void {
  const { settled } = useViewSwing()
  watch(
    settled,
    async () => {
      // After the render that put the new page in, and after `settle()`'s own tick,
      // which is when it scrolls to a hash.
      await nextTick()
      if (terminalOpen.value || paletteOpen.value) return

      const { hash, path } = router.currentRoute.value
      heading(hash)?.focus({ preventScroll: Boolean(hash) })

      pageAnnouncement.value = ''
      await nextTick()
      pageAnnouncement.value = pageLabel(path)
    },
    { flush: 'post' },
  )
}

/** The skip link's target: the page's heading, without the hash going through the router. */
export function focusPageHeading(): void {
  document.querySelector<HTMLElement>(HEADING)?.focus()
}
