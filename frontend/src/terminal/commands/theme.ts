import { decorativeMotion, isMotionSetting, MOTION_SETTINGS, useMotion } from '@/composables/useMotion'
import { useTheme } from '@/composables/useTheme'
import type { Localised } from '@/content/types'
import { messages as m } from '@/i18n/messages'
import { DEFAULT_THEME, findTheme, swatch, themes, type Theme } from '@/lib/themes'
import { toast, tryTheme } from '../achievements'
import { blank, fail, line, segmented } from '../format'
import type { Command, OutputLine, OutputSegment } from '../types'

/**
 * A scheme's palette as eight blocks — the strip of colour every r/unixporn screenshot
 * ends with. Literal colours rather than tones, since tones would paint every row of
 * the listing in whichever scheme happens to be on screen.
 */
export function swatches(theme: Theme): OutputSegment[] {
  return swatch(theme).map((colour) => ({ text: '███', colour }))
}

const HINT = {
  en: '`theme <name>` to switch, `theme random` if you cannot decide.',
  fr: '`theme <nom>` pour changer, `theme random` si vous hésitez.',
}

const FLASHBANG = {
  en: 'Flashbang out! `theme cyberpunk` once your eyes adjust.',
  fr: 'Flashbang ! `theme cyberpunk` quand vos yeux s’y seront faits.',
}

function listing(active: Theme): OutputLine[] {
  const width = themes.reduce((max, theme) => Math.max(max, theme.id.length), 0)
  return themes.map((theme) => {
    const on = theme.id === active.id
    const note = theme.id === DEFAULT_THEME ? 'default' : theme.mode === 'light' ? 'light' : ''
    return segmented([
      // `git branch`'s marker, for the same job.
      { text: on ? '* ' : '  ', tone: 'primary' },
      { text: theme.id.padEnd(width + 2), tone: on ? 'primary' : 'default' },
      ...swatches(theme),
      { text: note ? `  ${note}` : '', tone: 'muted' },
    ])
  })
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
    usage: 'theme [name|random]',
    description: { en: 'Show or switch colour scheme', fr: 'Afficher ou changer le thème' },
    group: 'core',
    writes: (args) => (args[0] ? 'local' : 'none'),
    palette: true,
    complete: ({ index }) => (index === 0 ? [...themes.map((theme) => theme.id), 'random'] : []),
    run({ args, t }) {
      const { theme: active, setTheme } = useTheme()
      const [requested] = args
      if (!requested) return [...listing(active.value), blank, line(t(HINT), 'muted')]

      const from = active.value
      let id = requested.toLowerCase()
      if (id === 'random') {
        const others = themes.filter((theme) => theme.id !== from.id)
        id = others[Math.floor(Math.random() * others.length)]!.id
      }
      if (!findTheme(id)) {
        return [
          fail(`theme: unknown theme \`${requested}\``),
          line(`available: ${themes.map((theme) => theme.id).join(', ')}`, 'muted'),
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
