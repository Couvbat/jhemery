/**
 * Colour parsing, conversion and contrast. sRGB is the hub: every input is parsed to
 * 8-bit RGB plus alpha, every output is derived from that. OKLCH goes through OKLab
 * (Björn Ottosson's matrices), which is what the site's own stylesheet uses for its
 * tokens, so the presets round-trip exactly.
 */

export interface RGB {
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

export interface HSL {
  h: number
  s: number
  l: number
}

export interface OKLCH {
  l: number
  c: number
  h: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, places = 0) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** `"50%"` → 0.5·scale, `"0.5"` → 0.5, `"128"` → 128. */
function num(token: string, percentScale = 1): number {
  const trimmed = token.trim()
  if (trimmed.endsWith('%')) return (Number.parseFloat(trimmed) / 100) * percentScale
  return Number.parseFloat(trimmed.replace(/deg$/, ''))
}

/** Splits `a, b, c / d` or `a b c / d` into its numbers, alpha last if present. */
function args(inner: string): { values: string[]; alpha?: string } {
  const [main, alpha] = inner.split('/')
  const values = main!.trim().split(/[\s,]+/).filter(Boolean)
  return { values, alpha: alpha?.trim() }
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1
  const value = token.endsWith('%') ? Number.parseFloat(token) / 100 : Number.parseFloat(token)
  return Number.isNaN(value) ? 1 : clamp(value, 0, 1)
}

/**
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` and
 * `oklch()`, in comma or space syntax, with or without `deg` and `%`. Returns `null` for
 * anything else — the tool shows "not a colour" rather than guessing.
 */
export function parseColour(input: string): RGB | null {
  const text = input.trim().toLowerCase()
  if (!text) return null

  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (hex) {
    let digits = hex[1]!
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const r = Number.parseInt(digits.slice(0, 2), 16)
    const g = Number.parseInt(digits.slice(2, 4), 16)
    const b = Number.parseInt(digits.slice(4, 6), 16)
    const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }

  const fn = /^(rgba?|hsla?|oklch)\((.*)\)$/.exec(text)
  if (!fn) return null
  const { values, alpha } = args(fn[2]!)
  // Legacy comma syntax puts alpha as a fourth value rather than after a slash.
  const alphaToken = alpha ?? values[3]
  if (values.length < 3 || values.length > 4) return null
  const [x, y, z] = values as [string, string, string]
  const a = parseAlpha(alphaToken)

  switch (fn[1]) {
    case 'rgb':
    case 'rgba': {
      const channel = (t: string) => clamp(Math.round(num(t, 255)), 0, 255)
      const rgb = { r: channel(x), g: channel(y), b: channel(z), a }
      return [rgb.r, rgb.g, rgb.b].some(Number.isNaN) ? null : rgb
    }
    case 'hsl':
    case 'hsla': {
      const h = num(x)
      const s = num(y)
      const l = num(z)
      if ([h, s, l].some(Number.isNaN)) return null
      return { ...hslToRgb({ h, s: clamp(s, 0, 1), l: clamp(l, 0, 1) }), a }
    }
    case 'oklch': {
      const l = num(x)
      // Chroma percentages are relative to 0.4, per the spec.
      const c = num(y, 0.4)
      const h = num(z)
      if ([l, c, h].some(Number.isNaN)) return null
      return { ...oklchToRgb({ l: clamp(l, 0, 1), c: Math.max(0, c), h }).rgb, a }
    }
  }
  return null
}

export function toHex({ r, g, b, a }: RGB): string {
  const pair = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
  return `#${pair(r)}${pair(g)}${pair(b)}${a < 1 ? pair(a * 255) : ''}`
}

function alphaSuffix(a: number): string {
  return a < 1 ? ` / ${round(a * 100)}%` : ''
}

export function toRgbString({ r, g, b, a }: RGB): string {
  return `rgb(${r} ${g} ${b}${alphaSuffix(a)})`
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: HSL): Omit<RGB, 'a'> {
  const hue = (((h % 360) + 360) % 360) / 60
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hue % 2) - 1))
  const m = l - c / 2
  let r: number
  let g: number
  let b: number
  if (hue < 1) [r, g, b] = [c, x, 0]
  else if (hue < 2) [r, g, b] = [x, c, 0]
  else if (hue < 3) [r, g, b] = [0, c, x]
  else if (hue < 4) [r, g, b] = [0, x, c]
  else if (hue < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const channel = (v: number) => Math.round(clamp(v + m, 0, 1) * 255)
  return { r: channel(r), g: channel(g), b: channel(b) }
}

export function toHslString(colour: RGB): string {
  const { h, s, l } = rgbToHsl(colour)
  return `hsl(${round(h)} ${round(s * 100)}% ${round(l * 100)}%${alphaSuffix(colour.a)})`
}

function srgbToLinear(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return c * 255
}

export function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(A, B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  // Below this chroma the hue is numerical noise, as it is for greys in every space.
  return { l: L, c, h: c < 1e-4 ? 0 : h }
}

/** `inGamut` is false when the colour had to be clipped to fit sRGB — an OKLCH the
 *  stylesheet can express but a screen cannot show exactly. */
export function oklchToRgb({ l, c, h }: OKLCH): { rgb: Omit<RGB, 'a'>; inGamut: boolean } {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  const raw = [lr, lg, lb].map(linearToSrgb)
  const inGamut = raw.every((v) => v >= -0.5 && v <= 255.5)
  const [r, g, b] = raw.map((v) => Math.round(clamp(v, 0, 255))) as [number, number, number]
  return { rgb: { r, g, b }, inGamut }
}

export function toOklchString(colour: RGB): string {
  const { l, c, h } = rgbToOklch(colour)
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)}${alphaSuffix(colour.a)})`
}

/** WCAG 2.x relative luminance of an opaque colour. */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG 2.x contrast ratio, 1 to 21. Alpha is ignored: contrast is defined for the
 *  colour as painted, and a translucent foreground depends on what is behind it. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

export type WcagLevel = 'AAA' | 'AA' | 'AA large' | 'fail'

/** Normal-text thresholds; `AA large` is the 3:1 that only large or bold text may use. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA large'
  return 'fail'
}
