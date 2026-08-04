/**
 * An ASCII sparkline, in the same spirit as the games' box-drawing boards: one
 * character per sample, height carried by the glyph rather than by a second row.
 */

/** Eight levels, lowest first. */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

export const SPARKLINE_WIDTH = 48

/** Averages `values` into `width` buckets. The backend already downsamples to
 *  roughly this, so this is the safety net for a series that arrives longer. */
function bucket(values: readonly number[], width: number): number[] {
  if (values.length <= width) return [...values]

  const out: number[] = []
  for (let i = 0; i < width; i++) {
    const start = Math.floor((i * values.length) / width)
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / width))
    const slice = values.slice(start, end)
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length)
  }
  return out
}

/**
 * Renders `values` as block characters scaled between their own min and max.
 *
 * A flat series draws as a flat line at the bottom rather than at a level picked
 * by dividing by zero — "nothing moved" should look like nothing moved.
 */
export function sparkline(values: readonly number[], width = SPARKLINE_WIDTH): string {
  const points = bucket(values.filter(Number.isFinite), width)
  if (!points.length) return ''

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min
  if (span === 0) return BLOCKS[0]!.repeat(points.length)

  return points
    .map((value) => {
      const level = Math.round(((value - min) / span) * (BLOCKS.length - 1))
      return BLOCKS[level]!
    })
    .join('')
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  eur: '€',
  usd: '$',
  gbp: '£',
  jpy: '¥',
}

/**
 * Prices here span four orders of magnitude — a coin at 55 000 and one at 0.42
 * both have to read sensibly — so the number of decimals follows the size of
 * the number rather than being fixed.
 */
export function formatPrice(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()] ?? `${currency.toUpperCase()} `
  const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 4
  // Grouped on the integer part only — running the separator over the whole
  // string turns `0.4200` into `0.4 200`.
  const [whole = '', fraction] = value.toFixed(decimals).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${symbol}${fraction ? `${grouped}.${fraction}` : grouped}`
}

/** `+0.7%` / `-1.2%` / `—` when the source gave no change at all. */
export function formatChange(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—'
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
}
