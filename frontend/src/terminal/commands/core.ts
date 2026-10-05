import { setLocale } from '@/i18n'
import type { Locale } from '@/content/types'
import { profile } from '@/content'
import { announce } from '../achievements'
import { aliases, parseDefinition, removeAlias, setAlias } from '../aliases'
import { history, historyBase } from '../history'
import { allCommands, completionNames, isCommandWord, resolve, visibleCommands } from '../registry'
import { findPage, renderManual } from '../manual'
import { page } from '../pager'
import type { Command, CommandGroup, OutputLine } from '../types'
import { blank, fail, line, pre, segmented } from '../format'

const GROUP_LABELS: Record<CommandGroup, { en: string; fr: string }> = {
  core: { en: 'shell', fr: 'shell' },
  navigate: { en: 'navigation', fr: 'navigation' },
  content: { en: 'content', fr: 'contenu' },
  live: { en: 'live data', fr: 'données live' },
  fun: { en: 'misc', fr: 'divers' },
}

/** `man [section] <page>`: a leading 1 or 6 is a section, as in `man 6 snake`. */
function manArgs(args: readonly string[]): { name: string | undefined; section: 1 | 6 | undefined } {
  if (args.length > 1 && /^[16]$/.test(args[0]!)) return { name: args[1], section: Number(args[0]) as 1 | 6 }
  return { name: args[0], section: undefined }
}

export const coreCommands: Command[] = [
  {
    name: 'help',
    aliases: ['?'],
    usage: 'help [command] [--all]',
    description: { en: 'List commands, or explain one', fr: 'Lister les commandes' },
    manual: {
      options: {
        '--all': { en: 'List the hidden commands too. A link may not ask for this.', fr: 'Lister aussi les commandes cachées. Un lien ne peut pas le demander.' },
      },
      examples: [{ command: 'help ls' }, { command: 'help --all' }],
      seeAlso: ['man(1)', 'jules(1)'],
    },
    group: 'core',
    writes: 'none',
    // Typed, `help --all` and `help vim` are fine. From a link they would hand out the
    // hidden commands, which is what the link rule exists to stop.
    linkable: (args) => !args.some((a) => a === '--all' || resolve(a)?.hidden === true),
    palette: true,
    // `completionNames()` and not `allCommands()`: `help vi<Tab>` must not hand
    // out `vim`, for the same reason the command word itself doesn't.
    complete: ({ index }) => (index === 0 ? [...completionNames(), '--all'] : []),
    run({ args, t }) {
      const [first] = args

      if (first && first !== '--all') {
        const command = resolve(first)
        if (!command) {
          return [fail(`help: no entry for \`${first}\``)]
        }
        return [
          line(command.name, 'primary'),
          line(`  ${t(command.description)}`),
          line(`  usage: ${command.usage ?? command.name}`, 'muted'),
          ...(command.aliases?.length
            ? [line(`  aliases: ${command.aliases.join(', ')}`, 'muted')]
            : []),
          line(`  ${t({ en: 'the whole page:', fr: 'la page entière :' })} man ${command.name}`, 'muted'),
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
    name: 'man',
    usage: 'man [section] <page>',
    description: { en: 'Read a command’s manual page', fr: 'Lire la page de manuel d’une commande' },
    manual: {
      description: {
        en: [
          'Shows the manual page for a command, a page at a time: space and b to turn, / to search, q to quit. Every command has one, built from what it says about itself. Section 1 is the commands, section 6 the games and the rest of the fun.',
          'There is a page for the person too. A real man can read it: curl -s jhemery.xyz/jules.1 | man -l -',
        ],
        fr: [
          'Affiche la page de manuel d’une commande, une page à la fois : espace et b pour tourner, / pour chercher, q pour quitter. Chaque commande en a une, tirée de ce qu’elle dit d’elle-même. La section 1 est celle des commandes, la 6 celle des jeux et du reste.',
          'Il y a aussi une page pour la personne. Un vrai man peut la lire : curl -s jhemery.xyz/jules.1 | man -l -',
        ],
      },
      examples: [{ command: 'man ls' }, { command: 'man 6 snake' }, { command: 'man jules' }],
      seeAlso: ['help(1)', 'jules(1)'],
    },
    group: 'core',
    writes: 'none',
    // A page that exists and isn't a hidden command's: `man vim` typed is fine, but from a
    // link it would hand out an easter egg, as `help vim` would.
    linkable: (args) => {
      const { name, section } = manArgs(args)
      if (!name) return false
      if (name.toLowerCase() === 'jules') return section === undefined || section === 1
      const command = resolve(name)
      return !!command && !command.hidden && findPage(name, section, allCommands()) !== undefined
    },
    complete: ({ args, index }) => {
      const pages = [...completionNames(), 'jules']
      if (index === 0) return [...pages, '1', '6']
      if (index === 1 && /^[16]$/.test(args[0] ?? '')) {
        const section = Number(args[0])
        return pages.filter((name) => findPage(name, section, visibleCommands()) !== undefined)
      }
      return []
    },
    async run(ctx) {
      const { name, section } = manArgs(ctx.args)
      if (!name) return [fail('What manual page do you want?'), line("For example, try 'man man'.", 'muted')]
      const found = findPage(name, section, allCommands())
      if (!found) return [fail(`No manual entry for ${name}${section ? ` in section ${section}` : ''}`)]
      const lines = renderManual(found, ctx.t)
      return (await page(ctx, lines, `${found.name}(${found.section})`)) ?? undefined
    },
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: { en: 'Clear the screen', fr: "Effacer l'écran" },
    group: 'core',
    writes: 'local',
    run({ clear }) {
      clear()
    },
  },
  {
    name: 'history',
    description: { en: 'Show command history', fr: "Afficher l'historique" },
    group: 'core',
    writes: 'none',
    run() {
      const entries = history.value
      if (!entries.length) return [line('(empty)', 'muted')]
      // Numbered from the first line ever kept, so `!N` still means what was printed here.
      const base = historyBase.value
      const width = String(base + entries.length).length
      return entries.map((entry, i) =>
        line(`${String(base + i + 1).padStart(width)}  ${entry}`, 'muted'),
      )
    },
  },
  {
    name: 'echo',
    usage: 'echo <text>',
    description: { en: 'Print a line of text', fr: 'Afficher du texte' },
    group: 'core',
    writes: 'local',
    run({ args }) {
      return [line(args.join(' '))]
    },
  },
  {
    name: 'date',
    description: { en: 'Show the current date', fr: 'Afficher la date' },
    group: 'core',
    writes: 'none',
    run({ locale }) {
      return [line(new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB'))]
    },
  },
  {
    name: 'whoami',
    description: { en: 'Print the current user', fr: "Afficher l'utilisateur" },
    manual: { seeAlso: ['jules(1)', 'neofetch(1)'] },
    group: 'core',
    writes: 'none',
    linkable: true,
    run() {
      return [line(profile.handle, 'primary')]
    },
  },
  {
    name: 'lang',
    usage: 'lang [en|fr]',
    description: { en: 'Show or switch language', fr: 'Afficher ou changer la langue' },
    group: 'core',
    writes: (args) => (args[0] ? 'local' : 'none'),
    palette: true,
    complete: ({ index }) => (index === 0 ? ['en', 'fr'] : []),
    run({ args, locale, t }) {
      const [requested] = args
      if (!requested) {
        return [line(`current: ${locale} — available: en, fr`, 'muted')]
      }
      const next = requested.toLowerCase()
      if (next !== 'en' && next !== 'fr') {
        return [fail(`lang: unsupported locale \`${requested}\``)]
      }
      setLocale(next as Locale)
      return [
        line(next === 'fr' ? 'Langue : français' : 'Language: English', 'success'),
        ...announce('lang', t),
      ]
    },
  },
  {
    name: 'alias',
    usage: "alias [name='command']",
    description: { en: 'Name your own commands', fr: 'Nommer vos propres commandes' },
    group: 'core',
    writes: 'local',
    hidden: true,
    run({ args, raw, t }) {
      const definition = raw.trim().slice('alias'.length).trim()

      if (!definition) {
        const entries = Object.entries(aliases.value)
        if (!entries.length) {
          return [
            line('(no aliases)', 'muted'),
            line("try: alias gl='git log'", 'muted'),
          ]
        }
        const width = entries.reduce((max, [name]) => Math.max(max, name.length), 0)
        // An alias stored before a command of the same name existed no longer runs;
        // say so here rather than interrupting the command when it does.
        const shadowed = t({ en: '(shadowed by a command)', fr: '(masqué par une commande)' })
        return entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, value]) =>
            isCommandWord(name)
              ? segmented([
                  { text: `${name.padEnd(width)}  →  ${value}`, tone: 'muted' },
                  { text: `  ${shadowed}`, tone: 'warning' },
                ])
              : pre(`${name.padEnd(width)}  →  ${value}`, 'primary'),
          )
      }

      const parsed = parseDefinition(definition)
      if (!parsed) {
        return [
          fail(`alias: ${args[0] ?? definition}: not found`),
          line("usage: alias <name>='<command>'", 'muted'),
        ]
      }

      const name = parsed.name.toLowerCase()
      // Shadowing a real command would let someone lock themselves out of their
      // own shell, and it survives a reload — so this one is a refusal, not a
      // faithful reimplementation of bash.
      // `git` too, the first word of `git log`: the alias would hide it all the same.
      if (isCommandWord(name)) {
        return [fail(`alias: \`${name}\` is already a command — pick another name.`)]
      }

      setAlias(name, parsed.value)
      return [
        line(`alias ${name}='${parsed.value}'`, 'success'),
        ...announce('alias', t),
      ]
    },
  },
  {
    name: 'unalias',
    usage: 'unalias <name>',
    description: { en: 'Remove an alias', fr: 'Supprimer un alias' },
    group: 'core',
    writes: 'local',
    hidden: true,
    complete: ({ index }) => (index === 0 ? Object.keys(aliases.value) : []),
    run({ args }) {
      const [name] = args
      if (!name) return [fail('unalias: missing operand')]
      return removeAlias(name.toLowerCase())
        ? [line(`removed alias \`${name}\``, 'success')]
        : [fail(`unalias: ${name}: not found`)]
    },
  },
  {
    name: 'exit',
    aliases: ['quit', 'logout'],
    description: { en: 'Close the terminal', fr: 'Fermer le terminal' },
    group: 'core',
    writes: 'none',
    run({ close }) {
      close()
    },
  },
]
