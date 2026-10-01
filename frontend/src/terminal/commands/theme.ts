import { decorativeMotion, isMotionSetting, MOTION_SETTINGS, useMotion } from '@/composables/useMotion'
import { applyForgedTheme, useTheme } from '@/composables/useTheme'
import type { Localised } from '@/content/types'
import { messages as m } from '@/i18n/messages'
import { allThemes, DEFAULT_THEME, findTheme, swatch, themes, type Theme } from '@/lib/themes'
import { toast, tryTheme } from '../achievements'
import { blank, fail, line, pre, segmented } from '../format'
import type { Command, CommandContext, OutputLine, OutputSegment } from '../types'

/**
 * A scheme's palette as eight blocks — the strip of colour every r/unixporn screenshot
 * ends with. Literal colours rather than tones, since tones would paint every row of
 * the listing in whichever scheme happens to be on screen.
 */
export function swatches(theme: Theme): OutputSegment[] {
  return swatch(theme).map((colour) => ({ text: '███', colour }))
}

const HINT = {
  en: '`theme <name>` to switch, `theme random` if you cannot decide, `theme forge <colour>` to make your own, `theme export kitty` to take one home.',
  fr: '`theme <nom>` pour changer, `theme random` si vous hésitez, `theme forge <couleur>` pour créer le vôtre, `theme export kitty` pour l’emporter.',
}

/** Kept here as well as in `forge.ts`, so completion and the usage line never load it. */
const FORMATS = ['alacritty', 'kitty', 'base16'] as const
const USAGE = 'theme [name|random] · theme forge <colour> [light] · theme export <alacritty|kitty|base16>'

const FLASHBANG = {
  en: 'Flashbang out! `theme cyberpunk` once your eyes adjust.',
  fr: 'Flashbang ! `theme cyberpunk` quand vos yeux s’y seront faits.',
}

function listing(active: Theme): OutputLine[] {
  const all = allThemes()
  const width = all.reduce((max, theme) => Math.max(max, theme.id.length), 0)
  return all.map((theme) => {
    const on = theme.id === active.id
    const note =
      theme.id === DEFAULT_THEME
        ? 'default'
        : [theme.seed ? `forged from ${theme.seed}` : '', theme.mode === 'light' ? 'light' : ''].filter(Boolean).join(', ')
    return segmented([
      // `git branch`'s marker, for the same job.
      { text: on ? '* ' : '  ', tone: 'primary' },
      { text: theme.id.padEnd(width + 2), tone: on ? 'primary' : 'default' },
      ...swatches(theme),
      { text: note ? `  ${note}` : '', tone: 'muted' },
    ])
  })
}

/**
 * `theme forge <colour> [light]`: grows a scheme from one colour (`lib/forge.ts`, loaded
 * here and nowhere earlier) and applies it as `custom`. The colour may be any CSS colour
 * the colour tool reads, so `oklch(0.7 0.15 40)` arrives as several words; a trailing
 * `light` or `dark` is the mode.
 */
async function forge(words: string[], t: CommandContext['t']): Promise<OutputLine[]> {
  const parts = [...words]
  const mode = parts.at(-1)?.toLowerCase() === 'light' ? 'light' : 'dark'
  if (['light', 'dark'].includes(parts.at(-1)?.toLowerCase() ?? '')) parts.pop()
  const seed = parts.join(' ')
  if (!seed) return [line('usage: theme forge <colour> [light]', 'error')]

  const { forgeScheme } = await import('@/lib/forge')
  const forged = forgeScheme(seed, mode)
  if (!forged) {
    return [
      // Quoted short: it is whatever was typed, and only ever printed as text.
      line(`theme forge: \`${seed.slice(0, 40)}\` is not a colour`, 'error'),
      line(t({ en: 'try `theme forge #d65d0e`, or `theme forge oklch(0.7 0.15 40) light`.', fr: 'essayez `theme forge #d65d0e`, ou `theme forge oklch(0.7 0.15 40) light`.' }), 'muted'),
    ]
  }
  const from = useTheme().theme.value
  const next = applyForgedTheme(forged.theme)
  return [
    segmented([{ text: `theme: ${next.id} (${t({ en: 'forged from', fr: 'forgé depuis' })} ${next.seed})  `, tone: 'primary' }, ...swatches(next)]),
    // Lifting reaches the floors for nearly every seed; when it can't, say which.
    ...forged.unmet.map((miss) => line(`  ⚠ ${miss}`, 'warning')),
    ...(from.mode === 'dark' && next.mode === 'light' ? [line(t(FLASHBANG), 'muted')] : []),
    line(t({ en: '`theme export kitty` (or alacritty, base16) to take it home.', fr: '`theme export kitty` (ou alacritty, base16) pour l’emporter.' }), 'muted'),
    ...toast(tryTheme(next), t),
  ]
}

/** `theme export <format>`: the scheme on screen as a config for a real terminal. */
async function exportTheme(format: string | undefined, t: CommandContext['t']): Promise<OutputLine[]> {
  const wanted = format?.toLowerCase()
  if (!wanted || !(FORMATS as readonly string[]).includes(wanted)) {
    return [
      line(wanted ? `theme export: unknown format \`${format}\`` : 'usage: theme export <alacritty|kitty|base16>', 'error'),
      line(`formats: ${FORMATS.join(', ')}`, 'muted'),
    ]
  }
  const { exportScheme } = await import('@/lib/forge')
  const text = exportScheme(useTheme().theme.value, wanted as (typeof FORMATS)[number])
  return [
    ...text.split('\n').map((row) => pre(row, row.startsWith('#') ? 'muted' : 'default')),
    blank,
    line(t({ en: 'Printed, not saved: select it and copy.', fr: 'Affiché, pas enregistré : sélectionnez-le et copiez.' }), 'muted'),
  ]
}

/** `motion`'s listing: the three settings, the one in force marked as `theme` marks its. */
function motionListing(t: <T>(value: Localised<T>) => T): OutputLine[] {
  const on = decorativeMotion()
  const width = Math.max(...MOTION_SETTINGS.map((id) => id.length))
  return MOTION_SETTINGS.map((id) =>
    segmented([
      { text: id === on ? '* ' : '  ', tone: 'primary' },
      { text: id.padEnd(width + 2), tone: id === on ? 'primary' : 'default' },
      { text: t(m.motion[id]), tone: 'muted' },
    ]),
  )
}

/** Said whenever the OS is what holds the level at `paused`, so a choice never looks ignored. */
function heldByOs(t: <T>(value: Localised<T>) => T): OutputLine[] {
  return useMotion().osReduced.value ? [line(t(m.motion.os), 'warning')] : []
}

export const themeCommands: Command[] = [
  {
    name: 'theme',
    // What vim calls it, for the people who will type that first.
    aliases: ['colorscheme'],
    usage: USAGE,
    description: { en: 'Show, switch, forge or export a colour scheme', fr: 'Afficher, changer, forger ou exporter un thème' },
    group: 'core',
    // Anything after the name counts as `local`: a switch and a forge change a setting,
    // and `export` rides along with them rather than earning a link of its own.
    writes: (args) => (args[0] ? 'local' : 'none'),
    palette: true,
    complete: ({ args, index }) => {
      if (index === 0) return [...allThemes().map((theme) => theme.id), 'random', 'forge', 'export']
      if (index === 1 && args[0]?.toLowerCase() === 'export') return [...FORMATS]
      return []
    },
    async run({ args, t }) {
      const { theme: active, setTheme } = useTheme()
      const [requested] = args
      if (!requested) return [...listing(active.value), blank, line(t(HINT), 'muted')]
      if (requested.toLowerCase() === 'forge') return forge(args.slice(1), t)
      if (requested.toLowerCase() === 'export') return exportTheme(args[1], t)

      const from = active.value
      let id = requested.toLowerCase()
      // From the shipped eleven only: a random pick should never land on the forge.
      if (id === 'random') {
        const others = themes.filter((theme) => theme.id !== from.id)
        id = others[Math.floor(Math.random() * others.length)]!.id
      }
      if (!findTheme(id)) {
        return [
          fail(`theme: unknown theme \`${requested}\``),
          line(`available: ${allThemes().map((theme) => theme.id).join(', ')}`, 'muted'),
        ]
      }

      const next = setTheme(id)!
      return [
        segmented([{ text: `theme: ${next.name}  `, tone: 'primary' }, ...swatches(next)]),
        ...(from.mode === 'dark' && next.mode === 'light' ? [line(t(FLASHBANG), 'muted')] : []),
        ...toast(tryTheme(next), t),
      ]
    },
  },
  {
    name: 'motion',
    usage: 'motion [full|calm|paused]',
    description: { en: 'Show or set how much the page moves', fr: 'Afficher ou régler les animations' },
    group: 'core',
    // A constant rather than a function of the arguments, as `theme` has: the bare
    // listing only reads, but `motion` is never worth a link, so nothing gains from it.
    writes: 'local',
    palette: true,
    complete: ({ index }) => (index === 0 ? [...MOTION_SETTINGS] : []),
    run({ args, t }) {
      const [requested] = args
      if (!requested) {
        return [
          ...motionListing(t),
          ...heldByOs(t),
          blank,
          line(t({ en: '`motion <full|calm|paused>` to change it.', fr: '`motion <full|calm|paused>` pour le changer.' }), 'muted'),
        ]
      }
      const id = requested.toLowerCase()
      if (!isMotionSetting(id)) {
        return [
          line(`motion: unknown setting \`${requested}\``, 'error'),
          line('usage: motion [full|calm|paused]', 'muted'),
        ]
      }
      useMotion().setMotion(id)
      return [segmented([{ text: `motion: ${id}  `, tone: 'primary' }, { text: t(m.motion[id]), tone: 'muted' }]), ...heldByOs(t)]
    },
  },
]
