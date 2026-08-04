import { describe, expect, it } from 'vitest'
import type { WeatherCondition } from '@/lib/api'
import { moodFor, NEUTRAL_MOOD } from '@/composables/useWeather'
import { ART_HEIGHT, ART_WIDTH, compass, weatherArt, windArrow } from '../weather-art'

const CONDITIONS: WeatherCondition[] = [
  'clear',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'thunder',
]

describe('weatherArt', () => {
  it('returns a fixed-size block for every condition', () => {
    // The detail column beside the glyph only lines up if this holds.
    for (const condition of CONDITIONS) {
      const art = weatherArt(condition)
      expect(art, condition).toHaveLength(ART_HEIGHT)
      for (const row of art) expect(row.length, `${condition}: "${row}"`).toBe(ART_WIDTH)
    }
  })

  it('keeps the same size at night', () => {
    for (const condition of CONDITIONS) {
      const art = weatherArt(condition, false)
      expect(art, condition).toHaveLength(ART_HEIGHT)
      for (const row of art) expect(row.length, condition).toBe(ART_WIDTH)
    }
  })

  it('draws a clear night differently from a clear day', () => {
    expect(weatherArt('clear', false)).not.toEqual(weatherArt('clear', true))
  })

  it('draws everything else the same after dark', () => {
    for (const condition of CONDITIONS.filter((c) => c !== 'clear')) {
      expect(weatherArt(condition, false), condition).toEqual(weatherArt(condition, true))
    }
  })

  it('never hands back the same array twice', () => {
    // Callers pad and trim these; a shared array would corrupt the table.
    const first = weatherArt('rain')
    first[0] = 'mutated'
    expect(weatherArt('rain')[0]).not.toBe('mutated')
  })
})

describe('compass', () => {
  it('names the cardinal points', () => {
    expect(compass(0)).toBe('N')
    expect(compass(90)).toBe('E')
    expect(compass(180)).toBe('S')
    expect(compass(270)).toBe('W')
  })

  it('names the intercardinals', () => {
    expect(compass(45)).toBe('NE')
    expect(compass(225)).toBe('SW')
  })

  it('wraps past a full turn and back through zero', () => {
    expect(compass(360)).toBe('N')
    expect(compass(361)).toBe('N')
    expect(compass(-90)).toBe('W')
  })
})

describe('windArrow', () => {
  it('points where the wind is going, not where it is from', () => {
    expect(windArrow(0)).toBe('↓')
    expect(windArrow(180)).toBe('↑')
  })

  it('wraps', () => {
    expect(windArrow(360)).toBe(windArrow(0))
    expect(windArrow(-45)).toBe(windArrow(315))
  })
})

describe('moodFor', () => {
  it('is neutral without a report', () => {
    expect(moodFor(null)).toEqual(NEUTRAL_MOOD)
  })

  it('is neutral when the station is unconfigured', () => {
    expect(moodFor({ configured: false })).toEqual(NEUTRAL_MOOD)
  })

  const now = (condition: WeatherCondition, isDay = true) => ({
    configured: true,
    now: {
      temperature: 12,
      apparent: 11,
      humidity: 70,
      windSpeed: 10,
      windDirection: 180,
      precipitation: 0,
      isDay,
      code: 0,
      condition,
    },
  })

  it('speeds the scene up in a storm and slows it in snow', () => {
    expect(moodFor(now('thunder')).speed).toBeGreaterThan(1)
    expect(moodFor(now('snow')).speed).toBeLessThan(1)
  })

  it('dims the scene in fog', () => {
    expect(moodFor(now('fog')).opacity).toBeLessThan(1)
  })

  it('dims further after dark without changing the speed', () => {
    const day = moodFor(now('clear', true))
    const night = moodFor(now('clear', false))
    expect(night.opacity).toBeLessThan(day.opacity)
    expect(night.speed).toBe(day.speed)
  })
})
