import { computed, onMounted, onUnmounted, ref } from 'vue'
import { profile } from '@/content'
import { relativeTime } from './useGithub'

/** How often the visible ticker re-reads the clock. A minute is plenty for a
 *  line measured in days. */
const TICK_MS = 60_000

/**
 * Whole-number days since the first commit — the site's "uptime". Lives here
 * rather than next to `neofetch` so the footer can show it without pulling the
 * whole terminal command registry into the main bundle.
 */
export function uptime(at: number = Date.now()): string {
  const days = Math.floor((at - new Date(profile.since).getTime()) / 86_400_000)
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
  }
}
