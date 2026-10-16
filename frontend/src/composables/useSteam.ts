import { computed, ref } from 'vue'
import { gaming } from '@/content'
import { api, type SteamFavourite, type SteamProfile, type SteamRecentGame } from '@/lib/api'

/**
 * Module-level so the gaming section and the terminal's `steam` command share one
 * request instead of hitting the API twice.
 */
const profile = ref<SteamProfile | null>(null)
const games = ref<SteamRecentGame[] | null>(null)
const receipts = ref<ReadonlyMap<number, SteamFavourite>>(new Map())
const loaded = ref(false)
let inFlight: Promise<void> | null = null

export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

/**
 * A favourite's receipts in one line, `1204h · 637/637`, and `achievements` after the count
 * where a reader has nothing else to say what it counts. Whole hours: a total in the
 * hundreds has no use for a decimal.
 */
export function formatReceipt(receipt: SteamFavourite, achievements = ''): string {
  const hours = receipt.minutes < 60 ? formatPlaytime(receipt.minutes) : `${Math.round(receipt.minutes / 60)}h`
  if (!receipt.achievements) return hours
  const { achieved, total } = receipt.achievements
  return `${hours} · ${achieved}/${total}${achievements ? ` ${achievements}` : ''}`
}

/** Each favourite in `content/gaming.ts`, with Steam's receipts when Steam had them. */
const favourites = computed(() => gaming.favourites.map((game) => ({ ...game, receipt: receipts.value.get(game.appId) })))

export function fetchSteam(): Promise<void> {
  if (loaded.value) return Promise.resolve()
  if (inFlight) return inFlight

  inFlight = api
    .steamActivity(gaming.favourites.map((game) => game.appId))
    .then((data) => {
      if (data.configured) {
        profile.value = data.profile ?? null
        games.value = data.recentGames ?? []
        receipts.value = new Map((data.favourites ?? []).map((receipt) => [receipt.appId, receipt]))
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
    favourites,
    loaded: computed(() => loaded.value),
    fetchSteam,
  }
}
