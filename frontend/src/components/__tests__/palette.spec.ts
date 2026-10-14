import { describe, expect, it } from 'vitest'
import { seasons } from '@/content'
import { NEUTRAL_MOOD } from '@/composables/useWeather'
import {
  COMPLETIONIST_PALETTE,
  fieldMood,
  pickPalette,
  SEASON_MOODS,
  SEASON_PALETTES,
  SECTION_PALETTES,
  VIEW_PALETTES,
} from '../palette'

describe('pickPalette', () => {
  it('ranks the completionist first, then the season, then the view, then the section', () => {
    expect(pickPalette(true, 'halloween', 'tools', 'music')).toBe(COMPLETIONIST_PALETTE)
    expect(pickPalette(false, 'halloween', 'tools', 'music')).toBe(SEASON_PALETTES.halloween)
    expect(pickPalette(false, 'halloween', 'home', 'music')).toBe(SEASON_PALETTES.halloween)
    expect(pickPalette(false, undefined, 'tools', 'music')).toBe(VIEW_PALETTES.tools)
    expect(pickPalette(false, undefined, 'home', 'music')).toBe(SECTION_PALETTES.music)
  })

  it('falls back to the section palette for a view without one, and to about for anything unknown', () => {
    expect(pickPalette(false, undefined, 'not-found', 'gaming')).toBe(SECTION_PALETTES.gaming)
    expect(pickPalette(false, undefined, 'home', 'nowhere')).toBe(SECTION_PALETTES.about)
  })
})

describe('seasons in the field', () => {
  it('gives every season a palette and a mood', () => {
    for (const { id } of seasons) {
      expect(SEASON_PALETTES[id], id).toBeDefined()
      expect(SEASON_MOODS[id], id).toBeDefined()
    }
  })

  // Its speed lives in the mood, which applies whichever palette wins; a palette speed
  // other than 1 would count it twice under the season and not at all under the completionist.
  it('leaves a season palette’s own speed neutral', () => {
    for (const palette of Object.values(SEASON_PALETTES)) expect(palette.speed).toBe(1)
  })

  it('multiplies a season’s mood into the weather’s, and leaves an ordinary day alone', () => {
    const storm = { speed: 1.7, opacity: 1.15 }
    expect(fieldMood(storm, undefined)).toBe(storm)
    const night = fieldMood(storm, 'solstice')
    expect(night.speed).toBeCloseTo(storm.speed * SEASON_MOODS.solstice.speed)
    expect(night.opacity).toBeCloseTo(storm.opacity * SEASON_MOODS.solstice.opacity)
    expect(fieldMood(NEUTRAL_MOOD, 'birthday')).toEqual(SEASON_MOODS.birthday)
  })

  // The weather's moods run from 0.5 to 1.7: a season is the same kind of nudge, not a
  // field that stops or one that blinds. Reversed is allowed, at the same pace.
  it('keeps each mood a nudge', () => {
    for (const [id, mood] of Object.entries(SEASON_MOODS)) {
      expect(Math.abs(mood.speed), id).toBeGreaterThanOrEqual(0.5)
      expect(Math.abs(mood.speed), id).toBeLessThanOrEqual(2)
      expect(mood.opacity, id).toBeGreaterThanOrEqual(0.5)
      expect(mood.opacity, id).toBeLessThanOrEqual(1.5)
    }
  })

  it('turns the field backwards on April Fools’ alone', () => {
    const reversed = Object.entries(SEASON_MOODS).filter(([, mood]) => mood.speed < 0).map(([id]) => id)
    expect(reversed).toEqual(['april-fools'])
  })
})
