import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import type { CommandContext, OutputLine } from '../types'

// jsdom has no `matchMedia`, and the flash is `useTheme`'s to test, not the command's.
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => true }))

/**
 * The scheme, the unlocks and `ricer`'s progress are all module-level state hydrated
 * from localStorage, so each test loads the three modules fresh — a page load — and
 * `reload()` does it again without clearing storage, which is what a visitor sees.
 */
async function reload() {
  vi.resetModules()
  const [{ themeCommands }, achievements, { useTheme }, { themes }] = await Promise.all([
    import('../commands/theme'),
    import('../achievements'),
    import('@/composables/useTheme'),
    import('@/lib/themes'),
  ])
  const theme = themeCommands.find((c) => c.name === 'theme')!
  const run = async (...args: string[]) =>
    ((await theme.run(context(args))) ?? []) as OutputLine[]
  return { theme, run, achievements, current: () => useTheme().theme.value, themes }
}

function context(args: string[]): CommandContext {
  return {
    args,
    raw: ['theme', ...args].join(' '),
    tty: true,
    locale: 'en',
    t: (<T,>(value: Localised<T>) => value.en) as CommandContext['t'],
    print: () => {},
    frame: () => () => {},
    clear: () => {},
    close: () => {},
    navigate: () => true,
    prompt: () => Promise.resolve(''),
    capture: () => () => {},
    run: () => Promise.resolve(),
    effects: {} as CommandContext['effects'],
    signal: new AbortController().signal,
  }
}

const text = (out: OutputLine[]) => out.map((l) => l.text).join('\n')

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('style')
})

describe('theme', () => {
  it('lists every scheme with its colours, marking the one in use', async () => {
    const { run, themes } = await reload()

    const out = await run()

    for (const scheme of themes) {
      const row = out.find((l) => l.text.slice(2).startsWith(`${scheme.id} `))!
      expect(row, scheme.id).toBeDefined()
      // Swatches carry the scheme's own colours, not tones: tones would paint every
      // row in whatever scheme is on screen.
      const colours = row.segments!.filter((s) => s.colour).map((s) => s.colour)
      expect(colours).toContain(scheme.colours.primary)
      expect(colours).toContain(scheme.colours.destructive)
    }
    expect(out.find((l) => l.text.startsWith('* '))?.text).toContain('cyberpunk')
    expect(out.find((l) => l.text.includes('gruvbox-light'))?.text).toMatch(/light$/)
    expect(text(out)).toContain('theme random')
  })

  it('switches scheme, whatever case it is typed in', async () => {
    const { run, current } = await reload()

    const out = await run('Nord')

    expect(current().id).toBe('nord')
    expect(out[0]!.text).toContain('theme: Nord')
    expect(out[0]!.tone ?? out[0]!.segments![0]!.tone).toBe('primary')
  })

  it('refuses a scheme that does not exist, and lists the ones that do', async () => {
    const { run, current } = await reload()

    const out = await run('windows-xp')

    expect(out[0]).toMatchObject({ tone: 'error', text: 'theme: unknown theme `windows-xp`' })
    expect(out[1]!.text).toContain('catppuccin-latte')
    expect(current().id).toBe('cyberpunk')
  })

  it('never lands on the scheme already in use with `random`', async () => {
    const { run, current } = await reload()

    for (const roll of [0, 0.5, 0.9999]) {
      vi.spyOn(Math, 'random').mockReturnValue(roll)
      const before = current().id
      await run('random')
      expect(current().id).not.toBe(before)
    }
  })

  it('completes scheme names, `random`, `forge` and `export`, then export’s formats', async () => {
    const { theme, themes } = await reload()

    expect(theme.complete!({ args: [''], index: 0, word: '' })).toEqual([
      ...themes.map((scheme) => scheme.id),
      'random',
      'forge',
      'export',
    ])
    expect(theme.complete!({ args: ['nord', ''], index: 1, word: '' })).toEqual([])
    expect(theme.complete!({ args: ['export', ''], index: 1, word: '' })).toEqual(['alacritty', 'kitty', 'base16'])
    expect(theme.complete!({ args: ['forge', ''], index: 1, word: '' })).toEqual([])
  })

  it('answers to vim’s name for it too', async () => {
    const { theme } = await reload()
    expect(theme.aliases).toContain('colorscheme')
  })

  describe('forge', () => {
    it('grows a scheme from one colour, applies it as `custom`, and keeps it', async () => {
      const { run, current } = await reload()

      const out = await run('forge', '#d65d0e')

      expect(current().id).toBe('custom')
      expect(current().seed).toBe('#d65d0e')
      expect(text(out)).toContain('theme: custom (forged from #d65d0e)')
      expect(out.some((l) => l.tone === 'warning')).toBe(false)
      expect(JSON.parse(window.localStorage.getItem('couvbat:theme:custom')!)).toMatchObject({ seed: '#d65d0e', mode: 'dark' })
      expect(window.localStorage.getItem('couvbat:theme')).toBe('custom')
      for (const value of Object.values(current().colours)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('takes a colour of several words, and a light mode after it', async () => {
      const { run, current } = await reload()

      await run('forge', 'oklch(0.6', '0.15', '250)', 'light')

      expect(current()).toMatchObject({ id: 'custom', mode: 'light' })
    })

    it('says what it could not read, and changes nothing', async () => {
      const { run, current } = await reload()

      const out = await run('forge', 'chartreuse-ish')

      expect(out[0]).toMatchObject({ tone: 'error', text: 'theme forge: `chartreuse-ish` is not a colour' })
      expect(current().id).toBe('cyberpunk')
      expect(text(await run('forge'))).toContain('usage: theme forge')
    })

    it('lists the forge with the others, and `random` never lands on it', async () => {
      const { run, current } = await reload()
      await run('forge', '#1e66f5')

      expect((await run()).find((l) => l.text.includes('custom'))?.text).toContain('forged from #1e66f5')
      for (const roll of [0, 0.5, 0.9999]) {
        vi.spyOn(Math, 'random').mockReturnValue(roll)
        await run('random')
        expect(current().id).not.toBe('custom')
      }
    })

    // No new achievement: the forge is one more scheme to the two that already count them.
    it('counts towards Ricer, and towards Flashbang when it is light', async () => {
      const { run, achievements } = await reload()
      for (const id of ['gruvbox', 'nord', 'dracula', 'catppuccin']) await run(id)

      const out = await run('forge', '#d65d0e', 'light')

      expect(achievements.isUnlocked('ricer')).toBe(true)
      expect(achievements.isUnlocked('flashbang')).toBe(true)
      expect(text(out)).toContain('achievement unlocked: Ricer')
    })
  })

  describe('export', () => {
    it('prints the scheme on screen as a config, and saves nothing', async () => {
      const { run } = await reload()
      await run('gruvbox')
      const before = { ...window.localStorage }

      const out = await run('export', 'kitty')

      expect(text(out)).toMatch(/^background +#282828$/m)
      expect(text(out)).toContain('color15')
      expect({ ...window.localStorage }).toEqual(before)
    })

    it('names the formats it knows when asked for another', async () => {
      const { run } = await reload()

      const out = await run('export', 'iterm')

      expect(out[0]).toMatchObject({ tone: 'error', text: 'theme export: unknown format `iterm`' })
      expect(out[1]!.text).toBe('formats: alacritty, kitty, base16')
    })
  })

  describe('ricer', () => {
    it('unlocks on the fifth different scheme, not before', async () => {
      const { run, achievements } = await reload()

      for (const id of ['gruvbox', 'nord', 'dracula', 'catppuccin']) {
        const out = await run(id)
        expect(text(out)).not.toContain('Ricer')
      }
      expect(achievements.isUnlocked('ricer')).toBe(false)

      const out = await run('tokyo-night')

      expect(achievements.isUnlocked('ricer')).toBe(true)
      expect(text(out)).toContain('achievement unlocked: Ricer')
    })

    it('does not count the same scheme twice', async () => {
      const { run, achievements } = await reload()

      for (let i = 0; i < 6; i++) await run(i % 2 ? 'nord' : 'gruvbox')

      expect(achievements.isUnlocked('ricer')).toBe(false)
    })

    it('keeps its progress across a reload', async () => {
      const first = await reload()
      for (const id of ['gruvbox', 'nord', 'dracula']) await first.run(id)

      const second = await reload()
      for (const id of ['everforest', 'solarized']) await second.run(id)

      expect(second.achievements.isUnlocked('ricer')).toBe(true)
    })

    // The navbar's scheme menu records through `tryTheme` directly, with no command
    // around it; the two have to add up to the same five.
    it('counts schemes picked from the navbar menu along with typed ones', async () => {
      const { run, achievements, themes } = await reload()

      for (const id of ['gruvbox', 'nord', 'dracula', 'catppuccin']) {
        achievements.tryTheme(themes.find((scheme) => scheme.id === id)!)
      }
      const out = await run('tokyo-night')

      expect(text(out)).toContain('achievement unlocked: Ricer')
    })
  })

  describe('flashbang', () => {
    it('unlocks on a light scheme, and says so', async () => {
      const { run, achievements } = await reload()

      const out = await run('catppuccin-latte')

      expect(achievements.isUnlocked('flashbang')).toBe(true)
      expect(text(out)).toContain('Flashbang out!')
      expect(text(out)).toContain('achievement unlocked: Flashbang')
    })

    it('unlocks from the navbar menu too, as a floating toast', async () => {
      const { achievements, themes } = await reload()

      const newly = achievements.tryTheme(themes.find((scheme) => scheme.id === 'gruvbox-light')!)

      expect(newly).toEqual(['flashbang'])
      expect(achievements.toastQueue.value.map((entry) => entry.id)).toEqual(['flashbang'])
    })

    it('stays locked on dark schemes', async () => {
      const { run, achievements } = await reload()

      for (const id of ['gruvbox', 'dracula', 'cyberpunk']) await run(id)

      expect(achievements.isUnlocked('flashbang')).toBe(false)
    })

    it('only jokes about it on the way from dark to light', async () => {
      const { run } = await reload()
      await run('gruvbox-light')

      const out = await run('catppuccin-latte')

      expect(text(out)).not.toContain('Flashbang out!')
    })
  })
})
