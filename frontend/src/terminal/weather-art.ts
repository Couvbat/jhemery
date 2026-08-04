import type { WeatherCondition } from '@/lib/api'

/**
 * One glyph per condition, in the spirit of wttr.in but hand-drawn here so
 * `weather` needs no second network round trip for its own artwork.
 *
 * Rows are stored without trailing padding — invisible trailing spaces are
 * miserable to maintain — and padded to `ART_WIDTH` on read, so the detail
 * column beside the glyph always starts in the same place. Nothing here uses an
 * emoji: they render double-width in some monospace stacks, which would shear
 * the column the padding exists to keep straight.
 */

export const ART_WIDTH = 11
export const ART_HEIGHT = 5

const ART: Record<WeatherCondition, string[]> = {
  clear: [
    '    \\   /',
    '     .-.',
    '  --(   )--',
    '     `-’',
    '    /   \\',
  ],
  cloudy: [
    '     .--.',
    '  .-(    ).',
    ' (___.__)__)',
    '',
    '',
  ],
  fog: [
    '',
    ' _ - _ - _',
    '  _ - _ - _',
    ' _ - _ - _',
    '',
  ],
  drizzle: [
    '     .-.',
    '    (   ).',
    '   (___(__)',
    '    ‘ ‘ ‘ ‘',
    '   ‘ ‘ ‘ ‘',
  ],
  rain: [
    '     .-.',
    '    (   ).',
    '   (___(__)',
    '   ‚‘‚‘‚‘‚‘',
    '   ‚’‚’‚’‚’',
  ],
  snow: [
    '     .-.',
    '    (   ).',
    '   (___(__)',
    '    *  *  *',
    '   *  *  *',
  ],
  thunder: [
    '     .-.',
    '    (   ).',
    '   (___(__)',
    '   ‚/‚/‚/‚/',
    '   ‚’‚’‚’‚’',
  ],
}

/** Only a clear sky reads differently after dark — the rest is unlit either way. */
const NIGHT_CLEAR: string[] = [
  '     .-.',
  '   (   ).',
  '  (   o   )',
  '   `-.-’',
  '',
]

export function weatherArt(condition: WeatherCondition, isDay = true): string[] {
  const rows = condition === 'clear' && !isDay ? NIGHT_CLEAR : (ART[condition] ?? ART.cloudy)
  return rows.map((row) => row.padEnd(ART_WIDTH).slice(0, ART_WIDTH))
}

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

/** 16-point compass, so `225°` reads as `SW` without a table per caller. */
export function compass(degrees: number): string {
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % POINTS.length
  return POINTS[index]!
}

/** Points where the wind is *going*, which is the opposite of where it is from. */
const ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'] as const

export function windArrow(degrees: number): string {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % ARROWS.length
  return ARROWS[index]!
}
