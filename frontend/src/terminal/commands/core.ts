import { setLocale } from '@/i18n'
import type { Locale } from '@/content/types'
import { profile } from '@/content'
import { announce } from '../achievements'
import { history } from '../history'
import { allCommands, resolve, visibleCommands } from '../registry'
import type { Command, CommandGroup, OutputLine } from '../types'
import { blank, line } from '../format'

const GROUP_LABELS: Record<CommandGroup, { en: string; fr: string }> = {
  core: { en: 'shell', fr: 'shell' },
  navigate: { en: 'navigation', fr: 'navigation' },
  content: { en: 'content', fr: 'contenu' },
  live: { en: 'live data', fr: 'données live' },
  fun: { en: 'misc', fr: 'divers' },
}

export const coreCommands: Command[] = [
  {
    name: 'help',
    aliases: ['?', 'man'],
    usage: 'help [command] [--all]',
    description: { en: 'List commands, or explain one', fr: 'Lister les commandes' },
    group: 'core',
    palette: true,
    run({ args, t }) {
      const [first] = args

      if (first && first !== '--all') {
        const command = resolve(first)
        if (!command) {
          return [line(`help: no entry for \`${first}\``, 'error')]
        }
        return [
          line(command.name, 'primary'),
          line(`  ${t(command.description)}`),
          line(`  usage: ${command.usage ?? command.name}`, 'muted'),
          ...(command.aliases?.length
            ? [line(`  aliases: ${command.aliases.join(', ')}`, 'muted')]
            : []),
        ]
      }

      const showAll = args.includes('--all')
      const pool = showAll ? allCommands() : visibleCommands()
      const width = pool.reduce((max, c) => Math.max(max, c.name.length), 0)
      const out: OutputLine[] = []

      for (const group of Object.keys(GROUP_LABELS) as CommandGroup[]) {
        const inGroup = pool.filter((c) => c.group === group)
        if (!inGroup.length) continue

        out.push(line(t(GROUP_LABELS[group]), 'accent'))
        for (const command of inGroup) {
          out.push({
            text: `  ${command.name.padEnd(width)}  ${t(command.description)}`,
            pre: true,
            tone: command.hidden ? 'muted' : 'default',
          })
        }
        out.push(blank)
      }

      if (!showAll) {
        out.push(line('Not everything is listed here. Poke around.', 'muted'))
      }
      return out
    },
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: { en: 'Clear the screen', fr: "Effacer l'écran" },
    group: 'core',
    run({ clear }) {
      clear()
    },
  },
  {
    name: 'history',
    description: { en: 'Show command history', fr: "Afficher l'historique" },
    group: 'core',
    run() {
      const entries = history.value
      if (!entries.length) return [line('(empty)', 'muted')]
      const width = String(entries.length).length
      return entries.map((entry, i) =>
        line(`${String(i + 1).padStart(width)}  ${entry}`, 'muted'),
      )
    },
  },
  {
    name: 'echo',
    usage: 'echo <text>',
    description: { en: 'Print a line of text', fr: 'Afficher du texte' },
    group: 'core',
    run({ args }) {
      return [line(args.join(' '))]
    },
  },
  {
    name: 'date',
    description: { en: 'Show the current date', fr: 'Afficher la date' },
    group: 'core',
    run({ locale }) {
      return [line(new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB'))]
    },
  },
  {
    name: 'whoami',
    description: { en: 'Print the current user', fr: "Afficher l'utilisateur" },
    group: 'core',
    run() {
      return [line(profile.handle, 'primary')]
    },
  },
  {
    name: 'lang',
    usage: 'lang [en|fr]',
    description: { en: 'Show or switch language', fr: 'Afficher ou changer la langue' },
    group: 'core',
    palette: true,
    run({ args, locale, t }) {
      const [requested] = args
      if (!requested) {
        return [line(`current: ${locale} — available: en, fr`, 'muted')]
      }
      const next = requested.toLowerCase()
      if (next !== 'en' && next !== 'fr') {
        return [line(`lang: unsupported locale \`${requested}\``, 'error')]
      }
      setLocale(next as Locale)
      return [
        line(next === 'fr' ? 'Langue : français' : 'Language: English', 'success'),
        ...announce('lang', t),
      ]
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'logout'],
    description: { en: 'Close the terminal', fr: 'Fermer le terminal' },
    group: 'core',
    run({ close }) {
      close()
    },
  },
]
