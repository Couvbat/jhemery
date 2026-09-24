import { useTheme } from '@/composables/useTheme'
import { DEFAULT_THEME, findTheme, themes, type Theme } from '@/lib/themes'
import { announce, toast, tryTheme } from '../achievements'
import { blank, line, segmented } from '../format'
import type { Command, OutputLine, OutputSegment } from '../types'

/**
 * A scheme's palette as eight blocks — the strip of colour every r/unixporn screenshot
 * ends with. Literal colours rather than tones, since tones would paint every row of
 * the listing in whichever scheme happens to be on screen.
 */
export function swatches({ colours: c }: Theme): OutputSegment[] {
  return [c.primary, c.accent, c.secondary, c.highlight, c.warning, c.destructive, c.foreground, c.muted].map(
    (colour) => ({ text: '███', colour }),
  )
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

export const themeCommands: Command[] = [
  {
    name: 'theme',
    // What vim calls it, for the people who will type that first.
    aliases: ['colorscheme'],
    usage: 'theme [name|random]',
    description: { en: 'Show or switch colour scheme', fr: 'Afficher ou changer le thème' },
    group: 'core',
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
          line(`theme: unknown theme \`${requested}\``, 'error'),
          line(`available: ${themes.map((theme) => theme.id).join(', ')}`, 'muted'),
        ]
      }

      const next = setTheme(id)!
      return [
        segmented([{ text: `theme: ${next.name}  `, tone: 'primary' }, ...swatches(next)]),
        ...(from.mode === 'dark' && next.mode === 'light' ? [line(t(FLASHBANG), 'muted')] : []),
        ...toast(tryTheme(next.id), t),
        ...(next.mode === 'light' ? announce('flashbang', t) : []),
      ]
    },
  },
]
