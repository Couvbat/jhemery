import { computed, onMounted, onUnmounted, ref } from 'vue'
import { isLive, profile, soonestEvent } from '@/content'
import { relativeTime } from './useGithub'

/** How often the visible ticker re-reads the clock. A minute is plenty for a
 *  line measured in days. */
const TICK_MS = 60_000

/** The same uptime to the second, which `/proc/uptime` prints as it is. */
export function uptimeSeconds(at: number = Date.now()): number {
  return (at - new Date(profile.since).getTime()) / 1000
}

/**
 * Whole-number days since the first commit — the site's "uptime". Lives here
 * rather than next to `neofetch` so the footer can show it without pulling the
 * whole terminal command registry into the main bundle.
 */
export function uptime(at: number = Date.now()): string {
  const days = Math.floor(uptimeSeconds(at) / 86_400)
  const years = Math.floor(days / 365)
  const remainder = days % 365
  return years > 0 ? `${years}y ${remainder}d` : `${days}d`
}

/** Uptime and deploy freshness, recomputed on a slow tick so the line stays
 *  honest on a tab that has been open for hours. */
export function useStatus(deployedAt: string) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)
  })
  onUnmounted(() => clearInterval(timer))

  return {
    uptime: computed(() => uptime(now.value)),
    lastDeploy: computed(() => {
      // `relativeTime` reads the clock itself, so the tick has to be depended on
      // explicitly for this one to ever change.
      void now.value
      return relativeTime(deployedAt, 'just now')
    }),
    /** The event the status line names (`content/events.ts`), re-read on the same tick. */
    event: computed(() => {
      const at = new Date(now.value)
      const next = soonestEvent(at)
      return next && { event: next, at, live: isLive(next, at) }
    }),
  }
}
