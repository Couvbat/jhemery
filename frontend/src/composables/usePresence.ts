import { computed, ref, watch } from 'vue'
import { api, ApiError, openEventSource } from '@/lib/api'

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
 * with another. `wall`'s wave rides the same stream as a named `wave` event
 * whose data is empty: no text, no sender, no time.
 *
 * It starts where it is wanted rather than app-wide: the footer on the home page,
 * and `who`/`wall` from anywhere (`whenPresent`). Starting it everywhere would change
 * what the footer's number counts.
 */

/** Null until the first message: an unconfigured or unreachable stream shows nothing. */
const online = ref<number | null>(null)
/** Give up after this many failed connections rather than reconnecting forever. */
const MAX_FAILURES = 3

/**
 * Bumped for each wave from someone else that is shown. The field ripples on it and
 * the terminal prints a line; neither learns anything else, because there is nothing
 * else to learn.
 */
const wave = ref(0)
/** Bumped when the stream gives up, so a `whenPresent` waiting on it can stop. */
const closed = ref(0)
/**
 * The server can't tell connections apart, so a wave comes back to the tab that sent it
 * too. It is excluded here instead: for this long after sending, waves are ignored. The
 * server broadcasts while it handles the POST, so the echo is never later than the reply;
 * this only has to cover a slow connection.
 */
export const OWN_ECHO_MS = 3_500
/**
 * However many arrive, one is shown at most this often: a ripple is a nudge, not a feed.
 * The server's own site-wide spacing (`WAVE_EVERY_MS`) is the same, so this only
 * matters to a tab that hears an old backend.
 */
export const SHOW_EVERY_MS = 15_000

/** `EventSource.CLOSED`, spelt out so a stand-in without the static still compares. */
const CLOSED = 2

let source: EventSource | null = null
let failures = 0
let ignoreUntil = -Infinity
let shownAt = -Infinity

export function startPresence(): void {
  if (source || typeof EventSource === 'undefined') return

  try {
    source = openEventSource('/presence')
  } catch {
    // Blocked or malformed URL — the counter simply never appears.
    return
  }
  // A stream that gave up earlier gets its three tries again: `who` typed after it is
  // the visitor asking for exactly that.
  failures = 0

  source.onmessage = (event) => {
    failures = 0
    try {
      const data = JSON.parse(event.data) as { online?: number }
      if (typeof data.online === 'number') online.value = data.online
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  }

  // Named, so it never reaches `onmessage`, and an old bundle never hears it at all.
  source.addEventListener('wave', () => {
    const now = Date.now()
    if (now < ignoreUntil || now - shownAt < SHOW_EVERY_MS) return
    shownAt = now
    wave.value++
  })

  source.onerror = () => {
    failures += 1
    // EventSource retries on its own; this only steps in once it is clear
    // nothing is listening, so a missing backend costs three attempts, not a
    // reconnect loop for as long as the tab is open. An HTTP error (a 502 while the
    // backend restarts) is different: the browser closes the source itself and never
    // retries, so it is let go at once, or `who` would wait on it for good.
    if (failures >= MAX_FAILURES || source?.readyState === CLOSED) stopPresence()
  }
}

export function stopPresence(): void {
  source?.close()
  source = null
  online.value = null
  closed.value++
}

/** How long `whenPresent` waits for a first count before calling the stream unavailable. */
const FIRST_COUNT_MS = 8_000

/**
 * The count, once there is one: starts the stream if nothing has (it only starts on the
 * home page otherwise), and resolves with the first figure, or `null` once the stream
 * has given up or the wait is over. Rejects with an `AbortError` on `signal`, as the
 * terminal's other waits do, so Ctrl+C stops it.
 */
export function whenPresent(signal?: AbortSignal): Promise<number | null> {
  startPresence()
  if (online.value !== null) return Promise.resolve(online.value)
  if (!source) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const stops: Array<() => void> = []
    const finish = (settle: () => void) => {
      for (const stop of stops) stop()
      settle()
    }
    stops.push(watch(online, (count) => count !== null && finish(() => resolve(count))))
    stops.push(watch(closed, () => finish(() => resolve(null))))
    const timer = setTimeout(() => finish(() => resolve(online.value)), FIRST_COUNT_MS)
    stops.push(() => clearTimeout(timer))
    if (signal) {
      const onAbort = () => finish(() => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
      stops.push(() => signal.removeEventListener('abort', onAbort))
    }
  })
}

export type WaveResult = 'sent' | 'alone' | 'limited' | 'unavailable' | 'off'

/**
 * `wall`: one wave to everyone else on the site. With nobody else here it is `alone`,
 * and no POST is made; a deployment that hasn't opted in says it is `off`; 429 is
 * `limited`; anything else that goes wrong — no stream, no route on an older backend,
 * no network — is `unavailable`. `sent` means the server took it, not that anyone saw
 * it: it coalesces waves site-wide, and says nothing about the others.
 */
export async function sendWave(signal?: AbortSignal): Promise<WaveResult> {
  const count = await whenPresent(signal)
  if (count === null) return 'unavailable'
  if (count <= 1) return 'alone'
  // Before the POST, not after: the server broadcasts while it handles it, so the echo
  // can arrive before the reply does. A refusal puts the window back as it was, so it
  // doesn't mute everyone else's waves for nothing.
  const before = ignoreUntil
  ignoreUntil = Date.now() + OWN_ECHO_MS
  try {
    const reply = await api.wall()
    if (reply?.configured !== false) return 'sent'
    ignoreUntil = before
    return 'off'
  } catch (error) {
    ignoreUntil = before
    return error instanceof ApiError && error.status === 429 ? 'limited' : 'unavailable'
  }
}

export function usePresence() {
  return { online: computed(() => online.value), wave: computed(() => wave.value) }
}
