import type { SeasonId } from '@/content'
import type { WeatherMood } from '@/composables/useWeather'

/**
 * Which colours and speed the wireframe field takes, as plain tables and one pure ranking,
 * so it can be tested without WebGL (as `ripple.ts` is). `ThreeBackground` reads them and
 * owns everything that turns a slot name into a colour.
 */

/** The four hue slots a palette picks from, by their historical names (§3: under Gruvbox
 *  `green` is orange). */
export type Hue = 'green' | 'cyan' | 'purple' | 'pink'

export interface Palette {
  base: Hue
  accent: Hue
  /** Multiplies the rotation speed, on top of the CRT boost. */
  speed: number
}

/** Each section gets its own mood. Falls back to the first entry for anything
 *  unknown, so adding a section can never leave the background unstyled. */
export const SECTION_PALETTES: Record<string, Palette> = {
  about: { base: 'green', accent: 'cyan', speed: 1 },
  projects: { base: 'cyan', accent: 'green', speed: 1.25 },
  music: { base: 'purple', accent: 'pink', speed: 1.6 },
  gaming: { base: 'pink', accent: 'purple', speed: 1.45 },
  hardware: { base: 'green', accent: 'purple', speed: 0.85 },
  contact: { base: 'cyan', accent: 'pink', speed: 1 },
}

/** The other views get a mood of their own, the way each section does. Anything not
 *  listed here (the 404, say) falls back to the section palette below. */
export const VIEW_PALETTES: Record<string, Palette> = {
  tools: { base: 'cyan', accent: 'purple', speed: 1.1 },
  watch: { base: 'pink', accent: 'cyan', speed: 0.9 },
  radio: { base: 'purple', accent: 'green', speed: 1.2 },
}

/** The reward for finding everything: a palette no section can produce. */
export const COMPLETIONIST_PALETTE: Palette = { base: 'pink', accent: 'cyan', speed: 1.35 }

/**
 * A season's day (`content/seasons.ts`) repaints the field everywhere, over every view and
 * section, for that one day. Slots rather than colours, so a season repaints inside the
 * visitor's scheme and never overrides it: Halloween's `green` is orange under Gruvbox,
 * which is rather the point. The speed is 1 because a season's speed is in its mood below,
 * which applies whichever palette wins.
 */
export const SEASON_PALETTES: Record<SeasonId, Palette> = {
  halloween: { base: 'purple', accent: 'green', speed: 1 },
  solstice: { base: 'purple', accent: 'cyan', speed: 1 },
  'new-year': { base: 'pink', accent: 'green', speed: 1 },
  birthday: { base: 'green', accent: 'pink', speed: 1 },
}

/**
 * A season's nudge to speed and opacity, multiplied in beside the weather's. Unlike the
 * colours it isn't ranked: a completionist still sees the field slow for the longest night,
 * in the palette they earned.
 */
export const SEASON_MOODS: Record<SeasonId, WeatherMood> = {
  halloween: { speed: 0.75, opacity: 0.8 },
  solstice: { speed: 0.5, opacity: 0.7 },
  'new-year': { speed: 1.8, opacity: 1.25 },
  birthday: { speed: 1.3, opacity: 1.15 },
}

/**
 * The palette that wins: the completionist's, then the day's season, then the view's
 * (away from home), then the section's. Positional arguments, since the loop calls this
 * on every frame of a scheme's ease and an options object would be one allocation each.
 */
export function pickPalette(completionist: boolean, season: SeasonId | undefined, view: string, section: string): Palette {
  if (completionist) return COMPLETIONIST_PALETTE
  if (season) return SEASON_PALETTES[season]
  if (view !== 'home' && VIEW_PALETTES[view]) return VIEW_PALETTES[view]
  return SECTION_PALETTES[section] ?? SECTION_PALETTES.about!
}

/** The weather's mood with the day's season multiplied in; the weather's own object on an ordinary day. */
export function fieldMood(weather: WeatherMood, season: SeasonId | undefined): WeatherMood {
  if (!season) return weather
  const day = SEASON_MOODS[season]
  return { speed: weather.speed * day.speed, opacity: weather.opacity * day.opacity }
}
