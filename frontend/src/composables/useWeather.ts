import { computed, ref } from 'vue'
import { api, type WeatherCondition, type WeatherReport } from '@/lib/api'

const report = ref<WeatherReport | null>(null)
let inFlight: Promise<void> | null = null

/**
 * How the sky nudges the background. Deliberately small multipliers: the section
 * palette owns the colour and the CRT owns the speed ceiling, and weather that
 * overrode either would read as a bug rather than as atmosphere.
 */
export interface WeatherMood {
  /** Multiplies the wireframes' rotation speed. */
  speed: number
  /** Multiplies their opacity — overcast reads as dimmer, not slower. */
  opacity: number
}

export const NEUTRAL_MOOD: WeatherMood = { speed: 1, opacity: 1 }

const MOODS: Record<WeatherCondition, WeatherMood> = {
  clear: { speed: 1.15, opacity: 1.15 },
  cloudy: { speed: 0.9, opacity: 0.85 },
  fog: { speed: 0.6, opacity: 0.55 },
  drizzle: { speed: 0.85, opacity: 0.9 },
  rain: { speed: 1.3, opacity: 0.8 },
  snow: { speed: 0.5, opacity: 1.1 },
  thunder: { speed: 1.7, opacity: 1.15 },
}

/** Night dims everything a little further, whatever the sky is doing. */
const NIGHT_OPACITY = 0.8

export function moodFor(report: WeatherReport | null): WeatherMood {
  const now = report?.configured ? report.now : undefined
  if (!now) return NEUTRAL_MOOD

  const mood = MOODS[now.condition] ?? NEUTRAL_MOOD
  return now.isDay ? mood : { speed: mood.speed, opacity: mood.opacity * NIGHT_OPACITY }
}

export const weatherMood = computed(() => moodFor(report.value))

export function fetchWeather(): Promise<void> {
  if (report.value) return Promise.resolve()
  if (inFlight) return inFlight

  inFlight = api
    .weather()
    .then((data) => {
      report.value = data
    })
    .catch(() => {
      // Unreachable or unconfigured: `weather` says so, and the background keeps
      // the neutral mood rather than guessing.
      report.value = { configured: false }
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

export function useWeather(autoFetch = true) {
  if (autoFetch) void fetchWeather()
  return {
    report: computed(() => report.value),
    mood: weatherMood,
    fetchWeather,
  }
}
