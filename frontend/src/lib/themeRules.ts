import { contrastRatio, oklchToRgb, parseColour, rgbToOklch, toHex, type RGB } from './colour'
import type { ThemeColours, ThemeMode } from './themes'

/**
 * The contrast every scheme is held to, in one place: `themes.ts` lifts muted and body
 * text to it when the table is built, `themes.spec.ts` checks every scheme against it,
 * and the scheme forge (`forge.ts`) grows a palette until it passes.
 *
 * Body and muted text reach WCAG AA (4.5:1) on every surface text is drawn on, raised
 * included: the 12 px window title bars are muted text on `bg-muted`, and that pair at
 * 4.04:1 is what held the accessibility score off 1.00. The colourful tones reach
 * AA-large (3:1) on the page background, where they are used.
 */

export type Tone = keyof ThemeColours

/** The three surfaces text is drawn on. */
export const TEXT_ON: Tone[] = ['background', 'surface', 'raised']
export const TEXT_FLOOR = 4.5

export interface Floor {
  text: Tone
  on: Tone[]
  min: number
}

export const FLOORS: Floor[] = [
  { text: 'foreground', on: TEXT_ON, min: TEXT_FLOOR },
  { text: 'muted', on: TEXT_ON, min: TEXT_FLOOR },
  { text: 'primary', on: ['background'], min: 4.5 },
  ...(['accent', 'secondary', 'warning', 'destructive'] as const).map((text) => ({ text, on: ['background'] as Tone[], min: 3 })),
]

function lowestRatio(colour: RGB, against: RGB[]): number {
  return Math.min(...against.map((back) => contrastRatio(colour, back)))
}

/**
 * `colour`, made just light enough (dark schemes) or dark enough (light ones) to reach
 * `floor` against every colour in `against`. Hue and chroma are kept, so a muted green
 * stays a muted green. A colour that already passes comes back unchanged, which is what
 * lets the default keep its `oklch()` values; a lifted one comes back as hex, which is
 * what three.js and `theme-color` can read. If even the end of the scale can't reach
 * the floor, the end of the scale is returned, and `checkFloors` reports it.
 */
export function liftToFloor(colour: string, against: string[], floor: number, mode: ThemeMode): string {
  const rgb = parseColour(colour)
  const backs = against.map(parseColour).filter((c): c is RGB => c !== null)
  if (!rgb || !backs.length || lowestRatio(rgb, backs) >= floor) return colour

  const lch = rgbToOklch(rgb)
  const step = mode === 'dark' ? 0.005 : -0.005
  for (let i = 1; ; i++) {
    // Clamped, so the last step lands on the end of the scale rather than a float short of it.
    const l = Math.min(1, Math.max(0, lch.l + i * step))
    const candidate: RGB = { ...oklchToRgb({ ...lch, l }).rgb, a: 1 }
    if (lowestRatio(candidate, backs) >= floor) return toHex(candidate)
    if (l === 0 || l === 1) break
  }
  // Keeping the chroma can stop short: a vivid tone clips to a tinted white or black that
  // contrasts less than the plain one. So the last resort is the end of the scale itself.
  return toHex(mode === 'dark' ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 })
}

/** The floor a tone is held to, and the surfaces it is checked on; `undefined` for the
 *  surfaces themselves and for `highlight`, which is never text. */
export function floorFor(tone: Tone): Floor | undefined {
  return FLOORS.find((floor) => floor.text === tone)
}

/** Whether a scheme clears every floor — the forge's verdict, and the specs'. */
export function meetsFloors(colours: ThemeColours): boolean {
  return checkFloors(colours).length === 0
}

/** Every floor a scheme misses, as `muted on raised 4.04 < 4.5`; empty when it meets them all. */
export function checkFloors(colours: ThemeColours): string[] {
  const unmet: string[] = []
  for (const { text, on, min } of FLOORS) {
    for (const surface of on) {
      const ratio = contrastRatio(parseColour(colours[text])!, parseColour(colours[surface])!)
      if (ratio < min) unmet.push(`${text} on ${surface} ${ratio.toFixed(2)} < ${min}`)
    }
  }
  return unmet
}
