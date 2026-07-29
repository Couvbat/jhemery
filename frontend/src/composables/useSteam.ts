import { computed, ref } from 'vue'
import { api, type SteamProfile, type SteamRecentGame } from '@/lib/api'

/**
 * Module-level so the gaming section and the terminal's `steam` command share one
 * request instead of hitting the API twice.
 */
const profile = ref<SteamProfile | null>(null)
const games = ref<SteamRecentGame[] | null>(null)
const loaded = ref(false)
let inFlight: Promise<void> | null = null

export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

export function fetchSteam(): Promise<void> {
  if (loaded.value) return Promise.resolve()
  if (inFlight) return inFlight

  inFlight = api
    .steamActivity()
    .then((data) => {
      if (data.configured) {
        profile.value = data.profile ?? null
        games.value = data.recentGames ?? []
      }
    })
    .catch(() => {
      // Unconfigured or unreachable — callers fall back to static content.
    })
    .finally(() => {
      loaded.value = true
      inFlight = null
    })

  return inFlight
}

export function useSteam(autoFetch = true) {
  if (autoFetch) void fetchSteam()
  return {
    profile: computed(() => profile.value),
    games: computed(() => games.value),
    loaded: computed(() => loaded.value),
    fetchSteam,
  }
}
