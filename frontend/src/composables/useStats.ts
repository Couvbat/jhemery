import { computed, ref } from 'vue'
import { api } from '@/lib/api'

/**
 * How many times anyone has opened the terminal.
 *
 * Counted once per session, when the overlay is first primed — not once per
 * command. Per-command would be chatter, and it would mean the server knowing
 * *which* commands get run, which is exactly the thing the `ask` route promises
 * not to record. One integer, no visitor id, nothing that says who.
 */

const sessions = ref<number | null>(null)
let recorded = false

/**
 * Fire-and-forget: the response updates the counter if it arrives, and a failure
 * is silent — a vanity number is never worth an error line in someone's shell.
 */
export function recordSession(): void {
  if (recorded) return
  recorded = true

  api
    .recordSession()
    .then((data) => {
      sessions.value = data.sessions
    })
    .catch(() => {
      // Offline, unreachable, or rate-limited. `neofetch` just omits the row.
    })
}

/** Reads the total without adding to it — used when nothing has recorded yet. */
export function fetchStats(): Promise<void> {
  if (sessions.value !== null) return Promise.resolve()
  return api
    .stats()
    .then((data) => {
      sessions.value = data.sessions
    })
    .catch(() => undefined)
}

export function useStats() {
  return { sessions: computed(() => sessions.value), recordSession, fetchStats }
}
