import { computed, ref } from 'vue'
import { api, type GuestbookEntry } from '@/lib/api'

/**
 * Polls the guestbook and surfaces anything that appeared since the page loaded.
 *
 * Polling rather than SSE on purpose: the payload is a handful of short entries,
 * the interesting event happens maybe twice a week, and a 20s poll costs one
 * request against an endpoint that is already cached — where an SSE channel would
 * mean a new backend module, a long-lived connection per visitor, and a reconnect
 * story. The cheaper thing is also the better thing here.
 */
const POLL_MS = 20_000
/** Stop bothering the API after this many failures in a row. */
const MAX_FAILURES = 3

/** Ids present the first time we looked — the baseline, never announced. */
const seen = new Set<string>()
const queue = ref<GuestbookEntry[]>([])

let timer: ReturnType<typeof setInterval> | undefined
let running = false
let failures = 0

async function poll(seeding = false) {
  // A backgrounded tab has nobody to show a toast to, and its timers are
  // throttled anyway — skip the request rather than queue up a burst.
  if (!seeding && typeof document !== 'undefined' && document.hidden) return

  try {
    const data = await api.guestbook()
    failures = 0

    // Guestbook off? Then there is nothing to watch, forever.
    if (!data.enabled) {
      stopGuestbookTicker()
      return
    }

    const entries = data.entries ?? []
    const fresh = seeding ? [] : entries.filter((entry) => !seen.has(entry.id))
    for (const entry of entries) seen.add(entry.id)

    if (fresh.length) queue.value = [...queue.value, ...fresh]
  } catch {
    failures += 1
    if (failures >= MAX_FAILURES) stopGuestbookTicker()
  }
}

/** Idempotent: the ticker is global, so a second mount must not double the rate. */
export function startGuestbookTicker() {
  if (running || typeof window === 'undefined') return
  running = true

  // The first pass only records what is already there — a visitor arriving after
  // ten signatures should not be told about all ten.
  void poll(true)
  timer = setInterval(() => void poll(), POLL_MS)
}

export function stopGuestbookTicker() {
  running = false
  clearInterval(timer)
  timer = undefined
}

export function dismissGuestbookEntry(id: string) {
  queue.value = queue.value.filter((entry) => entry.id !== id)
}

export function useGuestbookTicker() {
  return {
    queue: computed(() => queue.value),
    startGuestbookTicker,
    stopGuestbookTicker,
    dismissGuestbookEntry,
  }
}
