// @vitest-environment node
// Reads main.css off disk to compare against it; under jsdom `import.meta.url` is an
// http: URL and can't be turned back into a path.
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseColour } from '@/lib/colour'
import { checkFloors, liftToFloor, TEXT_FLOOR } from '../themeRules'
import { DEFAULT_THEME, findTheme, themes, themeTokens } from '../themes'

/** Every custom property `:root` declares in the stylesheet, with its value. */
function rootTokens(): Map<string, string> {
  const css = readFileSync(fileURLToPath(new URL('../../assets/main.css', import.meta.url)), 'utf8')
  const block = /:root\s*\{([^}]*)\}/.exec(css)![1]!
  return new Map(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]),
  )
}

describe('themes', () => {
  it('has unique ids a visitor can type', () => {
    const ids = themes.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })

  it('defaults to a dark scheme, and offers at least one light one to be flashbanged by', () => {
    expect(findTheme(DEFAULT_THEME)?.mode).toBe('dark')
    expect(themes.some((theme) => theme.mode === 'light')).toBe(true)
  })

  it('finds a scheme whatever case it is typed in', () => {
    expect(findTheme('Gruvbox')?.id).toBe('gruvbox')
    expect(findTheme('no-such-scheme')).toBeUndefined()
  })

  // The default is never written — applying it clears the overrides — so its table is
  // only what `theme` shows as swatches. This keeps the two from telling different stories.
  it('mirrors the stylesheet in the default scheme', () => {
    const root = rootTokens()
    const { colours } = findTheme(DEFAULT_THEME)!
    expect(colours).toMatchObject({
      background: root.get('--background'),
      surface: root.get('--card'),
      raised: root.get('--muted'),
      border: root.get('--border'),
      foreground: root.get('--foreground'),
      muted: root.get('--muted-foreground'),
      primary: root.get('--primary'),
      accent: root.get('--accent'),
      secondary: root.get('--secondary'),
      highlight: root.get('--neon-pink'),
      warning: root.get('--warning'),
      destructive: root.get('--destructive'),
    })
  })

  // A colour token added to `:root` and forgotten here would keep its neon value under
  // every other scheme — and a token written here that the stylesheet never reads is a typo.
  it('writes exactly the colour tokens the stylesheet declares', () => {
    const declared = [...rootTokens().keys()].filter((name) => name !== '--radius').sort()
    for (const theme of themes) expect(Object.keys(themeTokens(theme)).sort()).toEqual(declared)
  })

  // three.js' `Color` reads the `--neon-*` properties and does not parse `oklch()`, and
  // neither does every browser's `theme-color`. The default is exempt: it is never written.
  it('writes plain hex for every scheme but the default', () => {
    for (const theme of themes.filter((t) => t.id !== DEFAULT_THEME)) {
      for (const value of Object.values(theme.colours)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  // three.js reads the four hue slots off the page, and `THREE.Color` parses no `oklch()`.
  // So `:root` paints them in hex, while the table holds the default's oklch primary,
  // accent and secondary for its swatches: close, not equal. The wireframes' ease starts
  // from the property as painted, which is this hex, not the table's value.
  it('paints the default hue slots in hex, which three.js can read', () => {
    const root = rootTokens()
    for (const slot of ['--neon-green', '--neon-cyan', '--neon-purple', '--neon-pink']) {
      expect(root.get(slot), slot).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  // The default is never written, so main.css is its only definition, and it is the
  // scheme Lighthouse measures. It has to pass as shipped, not because the table lifted
  // a copy of it that nothing paints.
  it('ships a default that needs no lifting', () => {
    const root = rootTokens()
    const on = [root.get('--background')!, root.get('--card')!, root.get('--muted')!]
    for (const token of ['--foreground', '--muted-foreground']) {
      const value = root.get(token)!
      expect(liftToFloor(value, on, TEXT_FLOOR, 'dark'), token).toBe(value)
    }
  })

  // The floors live in themeRules.ts: body and muted text at AA (4.5:1) on background,
  // surface and raised; primary at AA; the colourful tones at AA-large (3:1).
  describe.each(themes.map((theme) => [theme.id, theme] as const))('%s', (_, theme) => {
    it('meets every contrast floor', () => {
      expect(checkFloors(theme.colours)).toEqual([])
    })

    it('says which way it faces', () => {
      const light = parseColour(theme.colours.background)!
      const lightness = (light.r + light.g + light.b) / 3
      expect(lightness > 127 ? 'light' : 'dark').toBe(theme.mode)
    })
  })
})
