import { profile } from '@/content'
import { prefersReducedMotion } from '@/composables/useCrt'
import { api, ApiError } from '@/lib/api'
import { COW, TRAIN } from '../ascii'
import { art, blank, line } from '../format'
import type { Command, CommandContext, OutputLine } from '../types'
import { forgetGuestbookFile, resolveGuestbookFile } from './guestbook-fs'
import { resolveFileLines } from './files'

const FORTUNES = [
  'Weeks of coding can save you hours of planning.',
  'There are two hard problems in computer science: cache invalidation, naming things, and off-by-one errors.',
  'It works on my machine is a valid bug report if you ship the machine.',
  'The best code is no code. The second best is code you deleted last week.',
  'A TODO comment is a promise you make to a stranger.',
  'Any sufficiently advanced configuration is indistinguishable from code.',
  'Premature optimisation is the root of all evil. Mature optimisation is a full-time job.',
  'The bug is in the last place you look, because you stop looking.',
]

const RM_STAGES = [
  'removing /usr/bin/…',
  'removing /etc/…',
  'removing /home/couvbat/portfolio…',
  'removing /home/couvbat/music/*.als…',
  'removing /home/couvbat/.ssh/…',
  'removing /…',
]

const VIM_SPLASH: string[] = [
  '',
  '',
  '',
  '',
  'VIM - Vi IMproved',
  '',
  'type :q to exit',
  '',
  "(Esc still won't save you)",
]

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      },
      { once: true },
    )
  })
}

/** Instant when the visitor asked for reduced motion, animated otherwise. */
async function paced(ctx: CommandContext, output: OutputLine[], stepMs: number) {
  if (prefersReducedMotion()) {
    ctx.print(output)
    return
  }
  for (const item of output) {
    ctx.print(item)
    await sleep(stepMs, ctx.signal)
  }
}

/** The only real thing `sudo` can do — remove a guestbook entry, given the admin password. */
async function removeGuestbookEntry(
  ctx: CommandContext,
  target: string,
): Promise<OutputLine[]> {
  const entry = resolveGuestbookFile(target)
  if (!entry) {
    return [line(`rm: cannot remove '${target}': No such file or directory`, 'error')]
  }

  const password = await ctx.prompt('[sudo] password for visitor:', { mask: true })
  if (!password) return [line('sudo: no password entered', 'error')]

  try {
    await api.deleteGuestbookEntry(entry.id, password)
    forgetGuestbookFile(target)
    return [line(`removed guestbook/${target}`, 'success')]
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return [line('sudo: incorrect password', 'error')]
    }
    if (error instanceof ApiError && error.status === 404) {
      return [line(`rm: cannot remove '${target}': No such file or directory`, 'error')]
    }
    return [line('rm: request failed', 'error')]
  }
}

export const eggCommands: Command[] = [
  {
    name: 'sudo',
    usage: 'sudo <command>',
    description: { en: 'Execute as superuser', fr: 'Exécuter en superutilisateur' },
    group: 'fun',
    hidden: true,
    async run(ctx) {
      const rest = ctx.args.join(' ')

      if (/^rm\s+-[rf]{1,2}\s+\/\s*$/.test(rest) || rest === 'rm -rf /') {
        await paced(
          ctx,
          RM_STAGES.map((text) => line(text, 'error')),
          320,
        )
        await ctx.effects.glitch(900)
        ctx.clear()
        return [
          line('kernel panic — not syncing: Attempted to kill init', 'error'),
          blank,
          line('…', 'muted'),
          blank,
          line('just kidding. everything is fine.', 'success'),
          line('(you should still not run that on a real machine)', 'muted'),
        ]
      }

      const rmMatch = /^rm\s+(?:-\w+\s+)?(\S+)$/.exec(rest)
      const rmTarget = rmMatch?.[1]
      if (rmTarget) {
        return removeGuestbookEntry(ctx, rmTarget)
      }

      return [
        line(`[sudo] password for visitor: `, 'muted'),
        line(
          `visitor is not in the sudoers file. This incident has been reported.`,
          'error',
        ),
      ]
    },
  },
  {
    name: 'matrix',
    description: { en: 'Follow the white rabbit', fr: 'Suivre le lapin blanc' },
    group: 'fun',
    hidden: true,
    run({ effects, close }) {
      if (prefersReducedMotion()) {
        return [line('Wake up, Neo… (animation skipped: reduced motion)', 'primary')]
      }
      close()
      effects.matrix()
    },
  },
  {
    name: 'crt',
    description: { en: 'Toggle CRT overdrive', fr: 'Basculer le mode CRT' },
    group: 'fun',
    hidden: true,
    run({ effects }) {
      const enabled = effects.crt()
      return [line(enabled ? 'CRT overdrive: ON' : 'CRT overdrive: OFF', 'primary')]
    },
  },
  {
    name: 'vim',
    aliases: ['vi', 'nvim', 'emacs'],
    description: { en: 'Open the editor', fr: "Ouvrir l'éditeur" },
    group: 'fun',
    hidden: true,
    run(ctx) {
      if (ctx.raw.startsWith('emacs')) {
        return [line('emacs: a great operating system, lacking only a decent editor.', 'muted')]
      }

      const [file] = ctx.args
      if (!file) {
        ctx.effects.vim(true, { name: '[No Name]', lines: VIM_SPLASH })
        return
      }

      const lines = resolveFileLines(file, ctx.t)
      if (!lines) {
        return [line(`vim: ${file}: No such file or directory`, 'error')]
      }
      ctx.effects.vim(true, { name: file, lines: lines.map((l) => l.text) })
    },
  },
  {
    name: ':q',
    aliases: [':q!', ':quit', ':quit!', ':wq', ':wq!', ':x'],
    description: { en: 'Escape', fr: 'Sortir' },
    group: 'fun',
    hidden: true,
    run({ effects, raw }) {
      const cmd = raw.trim()
      if (cmd === ':q' || cmd === ':q!' || cmd === ':quit' || cmd === ':quit!') {
        effects.vim(false)
        return [line('you are free. that was the hard part.', 'success')]
      }

      return [
        line("E45: 'readonly' option is set (add ! to override)", 'error'),
        line('hint: try `:q` — there is nothing to save anyway.', 'muted'),
      ]
    },
  },
  {
    name: 'hack',
    usage: 'hack [target]',
    description: { en: 'Breach the mainframe', fr: 'Pirater le mainframe' },
    group: 'fun',
    hidden: true,
    async run(ctx) {
      const target = ctx.args[0] ?? 'mainframe'
      const stages = [
        line(`nmap -sS -A ${target}`, 'muted'),
        line('PORT     STATE  SERVICE', 'muted'),
        line('22/tcp   open   ssh', 'primary'),
        line('80/tcp   open   http', 'primary'),
        line('1337/tcp open   elite', 'accent'),
        blank,
        line('bypassing firewall     [██████████] 100%', 'primary'),
        line('cracking encryption    [██████████] 100%', 'primary'),
        line('escalating privileges  [███████▒▒▒]  72%', 'warning'),
      ]
      await paced(ctx, stages, 260)
      await sleep(prefersReducedMotion() ? 0 : 600, ctx.signal)
      return [blank, line('ACCESS DENIED — nice try.', 'error')]
    },
  },
  {
    name: 'coffee',
    aliases: ['brew'],
    description: { en: 'Brew a coffee', fr: 'Préparer un café' },
    group: 'fun',
    hidden: true,
    run() {
      return [
        line('HTTP/1.1 418 I\'m a teapot', 'error'),
        line('The requested entity body is short and stout.', 'muted'),
      ]
    },
  },
  {
    name: 'play',
    description: { en: 'Play my music', fr: 'Lancer ma musique' },
    group: 'fun',
    palette: true,
    run({ effects, close }) {
      effects.playMusic()
      close()
    },
  },
  {
    name: 'cowsay',
    usage: 'cowsay <text>',
    description: { en: 'A cow says something', fr: 'Une vache parle' },
    group: 'fun',
    hidden: true,
    run({ args }) {
      const text = args.join(' ') || 'moo'
      const width = Math.min(text.length, 40)
      const wrapped: string[] = []
      for (let i = 0; i < text.length; i += width) wrapped.push(text.slice(i, i + width))

      const border = '-'.repeat(width + 2)
      const body =
        wrapped.length === 1
          ? [`< ${wrapped[0]!.padEnd(width)} >`]
          : wrapped.map((chunk, i) => {
              const [open, close] =
                i === 0 ? ['/', '\\'] : i === wrapped.length - 1 ? ['\\', '/'] : ['|', '|']
              return `${open} ${chunk.padEnd(width)} ${close}`
            })

      return [
        ...art([` ${border}`, ...body, ` ${'-'.repeat(width + 2)}`].join('\n'), 'default'),
        ...art(COW, 'muted'),
      ]
    },
  },
  {
    name: 'fortune',
    description: { en: 'A dubious aphorism', fr: 'Un aphorisme douteux' },
    group: 'fun',
    hidden: true,
    run() {
      return [line(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!, 'accent')]
    },
  },
  {
    name: 'sl',
    description: { en: 'You meant ls', fr: 'Vous vouliez dire ls' },
    group: 'fun',
    hidden: true,
    async run(ctx) {
      const rows = TRAIN.split('\n')
      if (prefersReducedMotion()) {
        return [...art(TRAIN, 'accent'), line('(you meant `ls`)', 'muted')]
      }

      // Slide the train right-to-left by trimming a growing indent.
      for (let offset = 20; offset >= 0; offset -= 4) {
        ctx.print(rows.map((row) => ({ text: ' '.repeat(offset) + row, tone: 'accent' as const, pre: true })))
        await sleep(120, ctx.signal)
      }
      return [line('(you meant `ls`)', 'muted')]
    },
  },
  {
    name: 'rickroll',
    description: { en: 'Do not', fr: 'Ne faites pas ça' },
    group: 'fun',
    hidden: true,
    async run({ prompt }) {
      const answer = (await prompt('this will open a video. are you sure? [y/N]')).toLowerCase()
      if (answer !== 'y' && answer !== 'yes') {
        return [line('wise.', 'muted')]
      }
      window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank', 'noopener,noreferrer')
      return [line('never gonna give you up', 'accent')]
    },
  },
  {
    name: 'uname',
    description: { en: 'System name', fr: 'Nom du système' },
    group: 'fun',
    hidden: true,
    run() {
      return [line(`couvsh 1.0 ${profile.domain} x86_64 GNU/Portfolio`, 'muted')]
    },
  },
]
