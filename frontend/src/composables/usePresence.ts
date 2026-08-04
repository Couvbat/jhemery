import { computed, ref } from 'vue'
import { apiUrl } from '@/lib/api'

/**
 * How many people are on the site right now, over the backend's `@Sse()` stream.
 *
 * This is the one live feature that pushes rather than polls, and it earns it:
 * a presence count is only interesting if it changes as people arrive and
 * leave, which is exactly what a held connection gives and a 20-second poll
 * does not. The guestbook ticker made the opposite call for the opposite
 * reason — see `docs/features-spec.md` §8.
 *
 * What crosses the wire is a single integer. No visitor id is sent, none is
 * assigned, and there is nothing on the server to correlate one connection
 * with another.
 */

/** Null until the first message: an unconfigured or unreachable stream shows nothing. */
const online = ref<number | null>(null)
/** Give up after this many failed connections rather than reconnecting forever. */
const MAX_FAILURES = 3

let source: EventSource | null = null
let failures = 0

export function startPresence(): void {
  if (source || typeof EventSource === 'undefined') return

  try {
    source = new EventSource(`${apiUrl}/presence`)
  } catch {
    // Blocked or malformed URL — the counter simply never appears.
    return
  }

  source.onmessage = (event) => {
    failures = 0
    try {
      const data = JSON.parse(event.data) as { online?: number }
      if (typeof data.online === 'number') online.value = data.online
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  }

  source.onerror = () => {
    failures += 1
    // EventSource retries on its own; this only steps in once it is clear
    // nothing is listening, so a missing backend costs three attempts, not a
    // reconnect loop for as long as the tab is open.
    if (failures >= MAX_FAILURES) stopPresence()
  }
}

export function stopPresence(): void {
  source?.close()
  source = null
  online.value = null
}

export function usePresence() {
  return { online: computed(() => online.value) }
}
