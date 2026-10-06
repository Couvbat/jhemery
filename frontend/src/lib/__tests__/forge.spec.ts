import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColour, rgbToOklch } from '@/lib/colour'
import { EXPORT_FORMATS, exportScheme, forgeScheme } from '../forge'
import { meetsFloors } from '../themeRules'
import { CUSTOM_THEME, findTheme, themes } from '../themes'

const HEX = /^#[0-9a-f]{6}$/
const hue = (colour: string) => rgbToOklch(parseColour(colour)!).h
const lightness = (colour: string) => rgbToOklch(parseColour(colour)!).l
const ratio = (a: string, b: string) => contrastRatio(parseColour(a)!, parseColour(b)!)

/** Seeds across the wheel and the awkward ends of it: near-black, near-white, grey, and
 *  the syntaxes the colour tool reads. */
const SEEDS = ['#d65d0e', '#00ff41', '#1e66f5', '#ff79c6', '#fabd2f', '#111111', '#fafafa', '#808080', 'rgb(46 160 67)', 'oklch(0.7 0.15 300)', 'hsl(190 80% 45%)']

describe('forgeScheme', () => {
  describe.each(SEEDS.flatMap((seed) => (['dark', 'light'] as const).map((mode) => [seed, mode] as const)))(
    '%s, %s',
    (seed, mode) => {
      const forged = forgeScheme(seed, mode)!

      it('comes out as twelve plain hex colours, whatever was typed', () => {
        expect(Object.keys(forged.theme.colours)).toHaveLength(12)
        for (const value of Object.values(forged.theme.colours)) expect(value).toMatch(HEX)
        expect(forged.theme.seed).toMatch(HEX)
        expect(forged.theme).toMatchObject({ id: CUSTOM_THEME, mode })
      })

      it('meets every floor the shipped schemes are held to, or says which it missed', () => {
        expect(meetsFloors(forged.theme.colours)).toBe(forged.unmet.length === 0)
        expect(forged.unmet).toEqual([])
      })

      it('faces the way it was asked to', () => {
        const background = lightness(forged.theme.colours.background)
        expect(mode === 'dark' ? background < 0.5 : background > 0.5).toBe(true)
        expect(ratio(forged.theme.colours.foreground, forged.theme.colours.background)).toBeGreaterThanOrEqual(4.5)
      })
    },
  )

  it('keeps the seed as primary when it already reads on the background', () => {
    expect(forgeScheme('#d65d0e', 'dark')!.theme.colours.primary).toBe('#d65d0e')
  })

  it('turns the other hues with the seed, and pins warning and error to amber and red', () => {
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    const forged = forgeScheme('#1e66f5', 'dark')!.theme.colours
    const seed = hue('#1e66f5')
    expect(near(hue(forged.accent), (seed + 150) % 360)).toBeLessThan(12)
    expect(near(hue(forged.secondary), (seed + 270) % 360)).toBeLessThan(12)
    expect(near(hue(forged.warning), 85)).toBeLessThan(12)
    expect(near(hue(forged.destructive), 25)).toBeLessThan(12)
  })

  it('refuses what is not a colour, and a mode that is not one of the two', () => {
    for (const seed of ['', 'orange-ish', '#12345', 'rgb(1, 2)', 'url(x)', '#d65d0e; color: red', 'oklch(0.5 1e999 0)', 'hsl(1e999 50% 50%)', 'oklch(0.5 0.1 1e999)']) {
      expect(forgeScheme(seed), seed).toBeNull()
    }
    expect(forgeScheme('#d65d0e', 'dim' as never)).toBeNull()
  })

  it('drops the seed’s alpha: a scheme is painted opaque', () => {
    expect(forgeScheme('#d65d0e80')!.theme.seed).toBe('#d65d0e')
  })
})

describe('exportScheme', () => {
  const gruvbox = findTheme('gruvbox')!

  it('writes alacritty’s tables, with all sixteen colours', () => {
    const text = exportScheme(gruvbox, 'alacritty')
    for (const table of ['[colors.primary]', '[colors.cursor]', '[colors.selection]', '[colors.normal]', '[colors.bright]']) {
      expect(text).toContain(table)
    }
    for (const key of ['background', 'foreground', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']) {
      expect(text).toMatch(new RegExp(`^${key} = "#[0-9a-f]{6}"$`, 'm'))
    }
    expect(text).toContain(`background = "${gruvbox.colours.background}"`)
    expect(text).toContain(`red = "${gruvbox.colours.destructive}"`)
  })

  it('writes kitty’s keys, color0 to color15', () => {
    const text = exportScheme(gruvbox, 'kitty')
    for (const key of ['foreground', 'background', 'selection_foreground', 'selection_background', 'cursor', 'cursor_text_color']) {
      expect(text).toMatch(new RegExp(`^${key} +#[0-9a-f]{6}$`, 'm'))
    }
    for (let i = 0; i < 16; i++) expect(text).toMatch(new RegExp(`^color${i} +#[0-9a-f]{6}$`, 'm'))
  })

  it('writes base16’s sixteen slots, hex without the #', () => {
    const text = exportScheme(gruvbox, 'base16')
    expect(text).toMatch(/^scheme: "Gruvbox"$/m)
    for (let i = 0; i < 16; i++) {
      expect(text).toMatch(new RegExp(`^base0${i.toString(16).toUpperCase()}: "[0-9a-f]{6}"$`, 'm'))
    }
    expect(text).toContain(`base00: "${gruvbox.colours.background.slice(1)}"`)
  })

  // The default's table is oklch, and `:root` disagrees with it on several tokens; the
  // export is the table, converted.
  it('exports the default from its table, as hex', () => {
    const cyberpunk = findTheme('cyberpunk')!
    for (const format of EXPORT_FORMATS) {
      const text = exportScheme(cyberpunk, format)
      expect(text, format).not.toContain('oklch')
      expect(text, format).toMatch(/[0-9a-f]{6}/)
    }
  })

  it('exports every shipped scheme and a forged one in every format', () => {
    const forged = forgeScheme('#d65d0e', 'light')!.theme
    for (const theme of [...themes, forged]) {
      for (const format of EXPORT_FORMATS) expect(exportScheme(theme, format).length, `${theme.id} ${format}`).toBeGreaterThan(100)
    }
    expect(exportScheme(forged, 'kitty')).toContain('forged from #d65d0e')
  })
})
