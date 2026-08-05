/**
 * Umami — the self-hosted instance at `umami.jhemery.xyz`.
 *
 * Umami ships as a single `<script>` that records a pageview on load and one on
 * every `history.pushState`. Vue Router's `createWebHistory` navigates with
 * exactly that call, so route changes are counted without any router hook here —
 * which is also why this file does not import the router.
 *
 * Loading it from a module instead of hardcoding the snippet in `index.html`
 * buys two things:
 *
 * - **Configuration.** The instance URL and website ID come from build-time env
 *   vars, so a fork or a second environment points somewhere else without
 *   editing markup. Vite's `%VITE_*%` substitution in `index.html` would leave a
 *   literal `%VITE_UMAMI_SRC%` in the `src` attribute when the var is unset.
 * - **An off switch that is the absence of config.** With both vars unset the
 *   script is never injected at all, so `npm run dev` and any preview build stay
 *   out of the dashboard by default rather than by remembering a flag.
 *
 * Nothing here identifies anyone: Umami is cookieless and stores aggregates, so
 * the site needs no consent banner for it.
 */

interface Umami {
  track(eventName: string, eventData?: Record<string, unknown>): void
}

declare global {
  interface Window {
    umami?: Umami
  }
}

/** Full URL of the tracker script, e.g. `https://umami.jhemery.xyz/script.js`. */
const src = import.meta.env.VITE_UMAMI_SRC
/** The UUID Umami shows under Settings → Websites → Edit. */
const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID
/** Optional comma-separated hostname allowlist, passed through as `data-domains`. */
const domains = import.meta.env.VITE_UMAMI_DOMAINS

type QueuedEvent = [name: string, data: Record<string, unknown> | undefined]

/**
 * Events fired before `script.js` finished loading. `window.umami` does not
 * exist until then and Umami has no queue of its own, so without this the first
 * seconds of every visit would silently drop whatever they recorded — which is
 * most of them, since the interesting events here happen on first interaction.
 *
 * Bounded because the script may never load at all: a content blocker cancels
 * the request, and `error` does not always fire when it does. An unbounded array
 * of events for a tracker that is never coming back is a leak.
 */
const queue: QueuedEvent[] = []
const QUEUE_LIMIT = 20

/** False until the tracker is known to be loadable — see `track()`. */
let ready = false
/** Set when the script errors, so `track()` stops queueing for a tracker that will never arrive. */
let unavailable = false

function flush(): void {
  ready = true
  for (const [name, data] of queue.splice(0)) window.umami?.track(name, data)
}

function abandon(): void {
  unavailable = true
  queue.length = 0
}

/**
 * Injects the tracker. Safe to call when unconfigured (does nothing) and safe to
 * call twice (the second call is ignored) — `main.ts` is the only caller.
 */
export function initAnalytics(): void {
  if (!src || !websiteId) return
  if (document.querySelector('script[data-umami-tracker]')) return

  const script = document.createElement('script')
  script.src = src
  script.defer = true
  script.dataset.websiteId = websiteId
  if (domains) script.dataset.domains = domains
  // Our own marker, not something Umami reads: `data-website-id` would work as a
  // selector too, but only until the ID contains a character that needs escaping.
  script.dataset.umamiTracker = ''
  script.addEventListener('load', flush)
  script.addEventListener('error', abandon)

  document.head.appendChild(script)
}

/**
 * Records a custom event, or drops it if analytics is switched off.
 *
 * Fire-and-forget by design: a failure to reach the analytics host must never
 * surface to a visitor, so this never throws and never returns a status.
 */
export function track(name: string, data?: Record<string, unknown>): void {
  if (!src || !websiteId || unavailable) return
  if (ready) {
    window.umami?.track(name, data)
    return
  }
  if (queue.length < QUEUE_LIMIT) queue.push([name, data])
}
