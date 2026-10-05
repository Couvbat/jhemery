import { oklchToRgb, parseColour, rgbToOklch, toHex, type OKLCH, type RGB } from './colour'
import { checkFloors, floorFor, liftToFloor } from './themeRules'
import { CUSTOM_THEME, type Theme, type ThemeColours, type ThemeMode } from './themes'

/**
 * The scheme forge (roadmap §H): one seed colour grown into the dozen a scheme names,
 * then held to the same floors as the eleven that ship, and the export of any scheme
 * as a config for a real terminal. Pure, and loaded only when `theme forge`,
 * `theme export` or the 🎨 menu's "make one…" asks for it — a forged scheme is stored
 * as its finished colours, so a reload never needs this module.
 *
 * Every colour that comes out is `#rrggbb` from `toHex`, whatever was typed in: the seed
 * is parsed into numbers first, so a visitor's text never reaches a style attribute.
 */

type Surface = 'background' | 'surface' | 'raised' | 'border' | 'foreground' | 'muted'
type Hue = 'accent' | 'secondary' | 'highlight' | 'warning' | 'destructive'

/**
 * The lightness ladder for the surfaces and the two text colours, in OKLCH, tinted a
 * little towards the seed's hue so a forged scheme reads as one family. The steps are
 * the ones the shipped dark and light schemes sit on (Gruvbox, Catppuccin, Nord): a
 * background, a card a step off it, a raised row a step further, and a border two.
 */
const LADDER: Record<ThemeMode, Record<Surface, { l: number; c: number }>> = {
  dark: {
    background: { l: 0.18, c: 0.015 },
    surface: { l: 0.21, c: 0.018 },
    raised: { l: 0.26, c: 0.02 },
    border: { l: 0.37, c: 0.03 },
    foreground: { l: 0.9, c: 0.03 },
    muted: { l: 0.72, c: 0.04 },
  },
  light: {
    background: { l: 0.97, c: 0.012 },
    surface: { l: 0.94, c: 0.015 },
    raised: { l: 0.9, c: 0.018 },
    border: { l: 0.8, c: 0.03 },
    foreground: { l: 0.3, c: 0.03 },
    muted: { l: 0.48, c: 0.04 },
  },
}

/**
 * Where the other tones sit on the wheel. `primary` is the seed itself; three hues turn
 * with it (an accent across the wheel, a secondary a quarter back, a highlight a sixth
 * on) and two are fixed, because a warning has to read as amber and an error as red
 * whatever the seed was.
 */
const HUES: Record<Hue, { turn: number } | { at: number }> = {
  accent: { turn: 150 },
  secondary: { turn: -90 },
  highlight: { turn: 60 },
  warning: { at: 85 },
  destructive: { at: 25 },
}

/** The colourful tones' lightness before lifting: bright on dark, deep on light. */
const TONE_LIGHTNESS: Record<ThemeMode, number> = { dark: 0.76, light: 0.52 }
/** Their chroma: the seed's, kept between a tint you can see and one sRGB can show. */
const MIN_CHROMA = 0.09
const MAX_CHROMA = 0.2
/** Below this a seed is a grey, as far as its hue goes. */
const GREY_CHROMA = 0.02

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const wrap = (hue: number) => ((hue % 360) + 360) % 360

function hex(lch: OKLCH): string {
  return toHex({ ...oklchToRgb({ ...lch, h: wrap(lch.h) }).rgb, a: 1 })
}

/** Any CSS colour as opaque `#rrggbb`, or null. Alpha is dropped: a scheme is painted opaque. */
function opaque(colour: string): RGB | null {
  const rgb = parseColour(colour)
  return rgb ? { ...rgb, a: 1 } : null
}

export interface Forged {
  theme: Theme
  /** The floors even lifting couldn't reach, as `checkFloors` words them; usually empty. */
  unmet: string[]
}

/**
 * A scheme grown from `seed` (any colour `parseColour` reads: `#d65d0e`, `rgb(…)`,
 * `oklch(…)`), facing `mode`. `null` for a seed that isn't a colour or a mode that isn't
 * one of the two.
 */
export function forgeScheme(seed: string, mode: ThemeMode = 'dark'): Forged | null {
  if (mode !== 'dark' && mode !== 'light') return null
  const rgb = opaque(seed)
  if (!rgb) return null
  const base = rgbToOklch(rgb)
  const chroma = clamp(base.c, MIN_CHROMA, MAX_CHROMA)

  const ladder = LADDER[mode]
  // A grey seed has no hue to lean towards (its hue reads as 0°, which is pink), so its
  // surfaces stay neutral.
  const tint = base.c < GREY_CHROMA ? 0 : 1
  const surface = (name: Surface) => hex({ l: ladder[name].l, c: ladder[name].c * tint, h: base.h })
  const tone = (hue: Hue) => {
    const place = HUES[hue]
    const h = 'turn' in place ? base.h + place.turn : place.at
    return hex({ l: TONE_LIGHTNESS[mode], c: chroma, h })
  }

  const raw: ThemeColours = {
    background: surface('background'),
    surface: surface('surface'),
    raised: surface('raised'),
    border: surface('border'),
    foreground: surface('foreground'),
    muted: surface('muted'),
    primary: toHex(rgb),
    accent: tone('accent'),
    secondary: tone('secondary'),
    highlight: tone('highlight'),
    warning: tone('warning'),
    destructive: tone('destructive'),
  }

  // Every tone with a floor is stepped until it clears it, the way the shipped schemes'
  // text is (`themes.ts`), hue and chroma kept. `highlight` has none: it is never text.
  // A floor is only ever measured against surfaces, which are never lifted, so the
  // order the tones are lifted in changes nothing.
  const colours = { ...raw }
  for (const name of Object.keys(colours) as (keyof ThemeColours)[]) {
    const floor = floorFor(name)
    if (!floor) continue
    const against = floor.on.map((surfaceName) => colours[surfaceName])
    colours[name] = toHex(opaque(liftToFloor(colours[name], against, floor.min, mode))!)
  }

  return {
    theme: { id: CUSTOM_THEME, name: 'Custom', mode, colours, seed: toHex(rgb) },
    unmet: checkFloors(colours),
  }
}

export const EXPORT_FORMATS = ['alacritty', 'kitty', 'base16'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

/**
 * The sixteen ANSI colours, from a scheme's twelve.
 *
 * - **Red is `destructive` and yellow `warning`**, always: they are the error and the
 *   warning a terminal paints in those two.
 * - **Green, cyan, blue and magenta** each take whichever of `primary`, `accent`,
 *   `secondary` and `highlight` sits nearest their hue in OKLCH (145°, 195°, 255° and
 *   330°). A scheme with no blue gives blue its nearest tone, so two slots can share one.
 * - **Black and white** are the surfaces and the text: on a dark scheme black is
 *   `raised` and white `foreground`; on a light one the other way round, with white
 *   `raised` so it still shows on the background.
 * - **Bright black is `muted`**, which is what shells draw suggestions and comments in.
 *   Every other bright colour is its normal one stepped 0.08 of OKLCH lightness away
 *   from the background — lighter on dark, deeper on light.
 */
interface Ansi {
  normal: Record<AnsiName, string>
  bright: Record<AnsiName, string>
}

const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const
type AnsiName = (typeof ANSI_NAMES)[number]

const ANSI_HUES: Record<'green' | 'cyan' | 'blue' | 'magenta', number> = { green: 145, cyan: 195, blue: 255, magenta: 330 }
const FREE_TONES = ['primary', 'accent', 'secondary', 'highlight'] as const
const BRIGHT_STEP = 0.08

function toHexColour(colour: string): string {
  return toHex(opaque(colour)!)
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrap(a) - wrap(b))
  return Math.min(d, 360 - d)
}

/** The scheme's tone nearest `hue`. Near-greys only win when everything is grey. */
function nearestTone(colours: ThemeColours, hue: number): string {
  const candidates = FREE_TONES.map((name) => ({ colour: colours[name], lch: rgbToOklch(opaque(colours[name])!) }))
  const tinted = candidates.filter(({ lch }) => lch.c >= 0.03)
  const pool = tinted.length ? tinted : candidates
  return pool.reduce((best, next) => (hueDistance(next.lch.h, hue) < hueDistance(best.lch.h, hue) ? next : best)).colour
}

/** `colour` moved `step` of OKLCH lightness away from the background. */
function awayFromBackground(colour: string, mode: ThemeMode, step = BRIGHT_STEP): string {
  const lch = rgbToOklch(opaque(colour)!)
  return hex({ ...lch, l: clamp(lch.l + (mode === 'dark' ? step : -step), 0, 1) })
}

function ansi(theme: Theme): Ansi {
  const c = Object.fromEntries(
    Object.entries(theme.colours).map(([name, value]) => [name, toHexColour(value)]),
  ) as unknown as ThemeColours
  const dark = theme.mode === 'dark'
  const normal: Record<AnsiName, string> = {
    black: dark ? c.raised : c.foreground,
    red: c.destructive,
    green: nearestTone(c, ANSI_HUES.green),
    yellow: c.warning,
    blue: nearestTone(c, ANSI_HUES.blue),
    magenta: nearestTone(c, ANSI_HUES.magenta),
    cyan: nearestTone(c, ANSI_HUES.cyan),
    white: dark ? c.foreground : c.raised,
  }
  const bright = Object.fromEntries(
    ANSI_NAMES.map((name) => [name, name === 'black' ? c.muted : awayFromBackground(normal[name], theme.mode)]),
  ) as Record<AnsiName, string>
  return { normal, bright }
}

function header(theme: Theme, comment: string): string {
  const from = theme.seed ? `, forged from ${theme.seed}` : ''
  return `${comment} ${theme.name} (${theme.mode}${from}) — exported from jhemery.xyz`
}

function alacritty(theme: Theme): string {
  const { normal, bright } = ansi(theme)
  const c = theme.colours
  const table = (name: string, entries: Record<string, string>) => [
    `[colors.${name}]`,
    ...Object.entries(entries).map(([key, value]) => `${key} = "${value}"`),
    '',
  ]
  return [
    header(theme, '#'),
    '# Alacritty 0.13 or later: import it, or paste it into alacritty.toml.',
    '',
    ...table('primary', { background: toHexColour(c.background), foreground: toHexColour(c.foreground) }),
    ...table('cursor', { text: toHexColour(c.background), cursor: toHexColour(c.primary) }),
    ...table('selection', { text: toHexColour(c.foreground), background: toHexColour(c.raised) }),
    ...table('normal', normal),
    ...table('bright', bright),
  ]
    .join('\n')
    .trimEnd()
}

function kitty(theme: Theme): string {
  const { normal, bright } = ansi(theme)
  const c = theme.colours
  const row = (key: string, value: string) => `${key.padEnd(22)}${value}`
  return [
    header(theme, '#'),
    '# kitty: save as a theme file and `include` it from kitty.conf.',
    '',
    row('foreground', toHexColour(c.foreground)),
    row('background', toHexColour(c.background)),
    row('selection_foreground', toHexColour(c.foreground)),
    row('selection_background', toHexColour(c.raised)),
    row('cursor', toHexColour(c.primary)),
    row('cursor_text_color', toHexColour(c.background)),
    row('url_color', toHexColour(c.accent)),
    row('active_border_color', toHexColour(c.primary)),
    row('inactive_border_color', toHexColour(c.border)),
    '',
    ...ANSI_NAMES.map((name, i) => row(`color${i}`, normal[name])),
    ...ANSI_NAMES.map((name, i) => row(`color${i + 8}`, bright[name])),
  ].join('\n')
}

/**
 * base16's sixteen slots, by their documented roles: 00–07 run from the background to
 * the brightest text (00 background, 01 surface, 02 raised for selections, 03 border for
 * comments and invisibles, 04 muted, 05 foreground, 06–07 the foreground stepped away
 * from the background), and 08–0F are the accents — red is `destructive`, yellow
 * `warning`, orange, green, cyan, blue and magenta the nearest tone by hue, and 0F, the
 * "deprecated" brown, `destructive` stepped towards the background. Classic YAML, hex
 * without the `#`.
 */
function base16(theme: Theme): string {
  const c = Object.fromEntries(
    Object.entries(theme.colours).map(([name, value]) => [name, toHexColour(value)]),
  ) as unknown as ThemeColours
  const mode = theme.mode
  const slots = [
    c.background,
    c.surface,
    c.raised,
    c.border,
    c.muted,
    c.foreground,
    awayFromBackground(c.foreground, mode, 0.04),
    awayFromBackground(c.foreground, mode, 0.08),
    c.destructive,
    nearestTone(c, 55),
    c.warning,
    nearestTone(c, ANSI_HUES.green),
    nearestTone(c, ANSI_HUES.cyan),
    nearestTone(c, ANSI_HUES.blue),
    nearestTone(c, ANSI_HUES.magenta),
    awayFromBackground(c.destructive, mode, -0.12),
  ]
  return [
    header(theme, '#'),
    `scheme: "${theme.name}"`,
    'author: "jhemery.xyz theme forge"',
    ...slots.map((colour, i) => `base0${i.toString(16).toUpperCase()}: "${colour.slice(1)}"`),
  ].join('\n')
}

/**
 * `theme` as a config for a real terminal. The default scheme is exported from its
 * table, converted to hex, not read from `:root`: the stylesheet and the table disagree on
 * several tokens (the hex `--neon-*` slots among them), and the table is the scheme.
 */
export function exportScheme(theme: Theme, format: ExportFormat): string {
  switch (format) {
    case 'alacritty':
      return alacritty(theme)
    case 'kitty':
      return kitty(theme)
    case 'base16':
      return base16(theme)
  }
}
