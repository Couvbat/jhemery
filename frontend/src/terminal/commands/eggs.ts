import { profile } from '@/content'
import { prefersReducedMotion } from '@/composables/useCrt'
import {
  MAX_SHAPE_COUNT,
  resetScene,
  setConstellation,
  setGravity,
  spawnShapes,
  useSceneControl,
} from '@/composables/useSceneControl'
import { api, ApiError } from '@/lib/api'
import { announce, unlock } from '../achievements'
import { COW, TRAIN } from '../ascii'
import { bannerLines, BANNER_MAX_CHARS } from '../ascii-banner'
import { art, blank, line, pre } from '../format'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine } from '../types'
import { forgetGuestbookFile, resolveGuestbookFile } from './guestbook-fs'
import { ENV_FILE } from './env-file'
import { listFiles, resolveFileLines } from './files'

/** The registration record `whois` invents for this domain. */
const WHOIS_RECORD: Array<[string, string]> = [
  ['Domain Name', profile.domain.toUpperCase()],
  ['Registry Domain ID', '1337-COUVBAT'],
  ['Registrar', 'couvsh registrar services, inc.'],
  ['Creation Date', `${profile.since}T00:00:00Z`],
  ['Registry Expiry Date', 'the heat death of the universe'],
  ['Registrant Name', profile.name],
  ['Registrant Organization', profile.employer],
  ['Registrant Country', 'FR'],
  ['Registrant Email', profile.email],
  ['Name Server', `NS1.${profile.domain.toUpperCase()}`],
  ['Name Server', `NS2.${profile.domain.toUpperCase()}`],
  ['DNSSEC', 'unsigned (living dangerously)'],
  ['Domain Status', 'clientTransferProhibited — it is mine'],
]

const SSH_STAGES = [
  `OpenSSH_9.6p1, OpenSSL 3.0.13`,
  `debug1: Connecting to ${profile.domain} port 22.`,
  'debug1: Server host key: ed25519 SHA256:c0uvb4t…',
  'debug1: Authenticating with public key "id_ed25519"',
  'debug1: Authentication succeeded (publickey).',
  'Last login: never — nobody has ever actually logged in here',
]

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
          ...announce('sudo', ctx.t),
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
    run({ effects, close, t }) {
      const toast = announce('matrix', t)
      if (prefersReducedMotion()) {
        return [line('Wake up, Neo… (animation skipped: reduced motion)', 'primary'), ...toast]
      }
      close()
      effects.matrix()
    },
  },
  {
    name: 'reboot',
    aliases: ['restart'],
    description: { en: 'Replay the boot sequence', fr: 'Rejouer la séquence de démarrage' },
    group: 'fun',
    hidden: true,
    run({ effects, close, t }) {
      const toast = announce('reboot', t)
      if (prefersReducedMotion()) {
        return [line('rebooting… (animation skipped: reduced motion)', 'primary'), ...toast]
      }
      close()
      effects.reboot()
    },
  },
  {
    name: 'ssh',
    usage: `ssh ${profile.handle}@${profile.domain}`,
    description: { en: 'Connect to the host', fr: "Se connecter à l'hôte" },
    group: 'fun',
    hidden: true,
    complete: ({ index }) =>
      index === 0
        ? [`${profile.handle}@${profile.domain}`, `contact@${profile.domain}`]
        : [],
    async run(ctx) {
      const target = ctx.args[0]
      if (!target) {
        return [line('usage: ssh [user@]hostname', 'error')]
      }

      const [user, host] = target.includes('@') ? target.split('@') : [profile.handle, target]
      if (host !== profile.domain && host !== 'localhost') {
        return [line(`ssh: Could not resolve hostname ${host}: Name or service not known`, 'error')]
      }

      // The contact section's own prompt is `ssh contact@jhemery.xyz`, so typing it
      // does the thing it advertises rather than the joke.
      if (user === 'contact') {
        ctx.print(line(`${user}@${host}: opening a channel…`, 'primary'))
        ctx.navigate('contact')
        return
      }

      if (user !== profile.handle && user !== 'root') {
        return [
          line(`${user}@${host}: Permission denied (publickey).`, 'error'),
          line(`hint: there is exactly one account here, and it is \`${profile.handle}\`.`, 'muted'),
        ]
      }

      await paced(
        ctx,
        SSH_STAGES.map((text) => line(text, 'muted')),
        220,
      )

      const toast = announce('ssh', ctx.t)
      if (prefersReducedMotion()) {
        return [blank, line('connected. (boot animation skipped: reduced motion)', 'success'), ...toast]
      }

      ctx.print([blank, line(`${user}@${host}'s shell is starting…`, 'success')])
      await sleep(500, ctx.signal)
      ctx.close()
      ctx.effects.reboot()
      return toast
    },
  },
  {
    name: 'whois',
    usage: `whois ${profile.domain}`,
    description: { en: 'Look up a domain record', fr: 'Consulter un enregistrement de domaine' },
    group: 'fun',
    hidden: true,
    complete: ({ index }) => (index === 0 ? [profile.domain, profile.handle] : []),
    run({ args }) {
      const query = (args[0] ?? profile.domain).toLowerCase().replace(/^https?:\/\//, '')
      const known = [profile.domain, profile.handle, profile.alias.toLowerCase(), 'localhost']

      if (!known.includes(query)) {
        return [
          line(`No match for "${query.toUpperCase()}".`, 'error'),
          blank,
          line('>>> this registry only knows about one domain, and you are on it.', 'muted'),
        ]
      }

      const width = WHOIS_RECORD.reduce((max, [key]) => Math.max(max, key.length), 0)
      return [
        ...WHOIS_RECORD.map(([key, value]) => pre(`${`${key}:`.padEnd(width + 2)}${value}`, 'primary')),
        blank,
        line('>>> Last update of whois database: just now, by hand, in a .ts file.', 'muted'),
      ]
    },
  },
  {
    name: 'crt',
    description: { en: 'Toggle CRT overdrive', fr: 'Basculer le mode CRT' },
    group: 'fun',
    hidden: true,
    run({ effects, t }) {
      const enabled = effects.crt()
      return [
        line(enabled ? 'CRT overdrive: ON' : 'CRT overdrive: OFF', 'primary'),
        ...announce('crt', t),
      ]
    },
  },
  {
    name: 'vim',
    aliases: ['vi', 'nvim', 'emacs'],
    description: { en: 'Open the editor', fr: "Ouvrir l'éditeur" },
    group: 'fun',
    hidden: true,
    complete: ({ index }) => (index === 0 ? listFiles() : []),
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
      // The vim pane hides the scrollback, so this one goes out as a floating
      // toast rather than as output lines nobody would see.
      if (file === ENV_FILE) unlock('dotenv')
      ctx.effects.vim(true, { name: file, lines: lines.map((l) => l.text) })
    },
  },
  {
    name: ':q',
    aliases: [':q!', ':quit', ':quit!', ':wq', ':wq!', ':x'],
    description: { en: 'Escape', fr: 'Sortir' },
    group: 'fun',
    hidden: true,
    run({ effects, raw, t }) {
      const cmd = raw.trim()

      if (cmd === ':q' || cmd === ':quit') {
        if (effects.vimIsDirty()) {
          const message = 'E37: No write since last change (add ! to override)'
          effects.vimMessage(message)
          return [line(message, 'error')]
        }
        effects.vim(false)
        return [line('you are free. that was the hard part.', 'success'), ...announce('vim', t)]
      }

      if (cmd === ':q!' || cmd === ':quit!') {
        effects.vim(false)
        return [line('you are free. that was the hard part.', 'success'), ...announce('vim', t)]
      }

      const message = "E45: 'readonly' option is set (add ! to override)"
      effects.vimMessage(`${message} — try :q to quit without writing`)
      return [
        line(message, 'error'),
        line('hint: try `:q` to quit without writing.', 'muted'),
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
      return [blank, line('ACCESS DENIED — nice try.', 'error'), ...announce('hack', ctx.t)]
    },
  },
  {
    name: 'coffee',
    aliases: ['brew'],
    description: { en: 'Brew a coffee', fr: 'Préparer un café' },
    group: 'fun',
    hidden: true,
    run({ t }) {
      return [
        line('HTTP/1.1 418 I\'m a teapot', 'error'),
        line('The requested entity body is short and stout.', 'muted'),
        ...announce('coffee', t),
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
    run({ args, t }) {
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
        ...announce('cowsay', t),
      ]
    },
  },
  {
    name: 'fortune',
    description: { en: 'A dubious aphorism', fr: 'Un aphorisme douteux' },
    group: 'fun',
    hidden: true,
    run({ t }) {
      return [
        line(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!, 'accent'),
        ...announce('fortune', t),
      ]
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
        return [...art(TRAIN, 'accent'), line('(you meant `ls`)', 'muted'), ...announce('sl', ctx.t)]
      }

      // Slide the train right-to-left by shrinking its indent. Each step redraws
      // the same region — printing would stack a still of every position instead.
      const draw = ctx.frame()
      for (let offset = 40; offset >= 0; offset -= 2) {
        draw(rows.map((row) => ({ text: ' '.repeat(offset) + row, tone: 'accent' as const, pre: true })))
        await sleep(60, ctx.signal)
      }
      return [line('(you meant `ls`)', 'muted'), ...announce('sl', ctx.t)]
    },
  },
  {
    name: 'rickroll',
    description: { en: 'Do not', fr: 'Ne faites pas ça' },
    group: 'fun',
    hidden: true,
    async run({ prompt, t }) {
      const answer = (await prompt('this will open a video. are you sure? [y/N]')).toLowerCase()
      if (answer !== 'y' && answer !== 'yes') {
        return [line('wise.', 'muted')]
      }
      window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank', 'noopener,noreferrer')
      return [line('never gonna give you up', 'accent'), ...announce('rickroll', t)]
    },
  },
  {
    name: 'banner',
    usage: 'banner <text>',
    description: { en: 'Say it in block letters', fr: 'Le dire en grosses lettres' },
    group: 'fun',
    hidden: true,
    run({ args, t }) {
      const text = args.join(' ')
      if (!text.trim()) return [line('banner: missing operand', 'error')]

      const rendered = bannerLines(text)
      if (!rendered.length) return [line('banner: nothing to print', 'error')]

      return [
        ...rendered.map((row) => pre(row, 'primary')),
        ...(text.length > BANNER_MAX_CHARS
          ? [blank, line(`(wrapped at ${BANNER_MAX_CHARS} characters a line)`, 'muted')]
          : []),
        ...announce('banner', t),
      ]
    },
  },
  {
    name: 'gravity',
    usage: 'gravity [on|off]',
    description: { en: 'Toggle the background pull', fr: "Basculer l'attraction du fond" },
    group: 'fun',
    hidden: true,
    complete: ({ index }) => (index === 0 ? ['on', 'off'] : []),
    run({ args, t }) {
      const [requested] = args
      if (requested && requested !== 'on' && requested !== 'off') {
        return [line(`gravity: expected \`on\` or \`off\`, got \`${requested}\``, 'error')]
      }

      const on = setGravity(requested ? requested === 'on' : undefined)
      return [
        line(on ? 'gravity: ON — the shapes follow your cursor again.' : 'gravity: OFF', 'primary'),
        // Turning it off is the interesting half; turning it back on is just undo.
        ...(on ? [] : announce('zeroG', t)),
      ]
    },
  },
  {
    name: 'spawn',
    usage: 'spawn [count]',
    description: { en: 'Add shapes to the background', fr: 'Ajouter des formes au fond' },
    group: 'fun',
    hidden: true,
    run({ args }) {
      const requested = args[0] ? Number(args[0]) : 1
      if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
        return [line(`spawn: \`${args[0]}\` is not a whole number`, 'error')]
      }

      const before = useSceneControl().shapeCount.value
      const after = spawnShapes(requested)
      if (after === before) {
        return [
          line(
            requested > 0
              ? `spawn: already at the ceiling of ${MAX_SHAPE_COUNT} shapes`
              : 'spawn: already at the floor of 1 shape',
            'warning',
          ),
        ]
      }
      return [line(`${after} shapes in the scene (was ${before})`, 'primary')]
    },
  },
  {
    name: 'constellation',
    aliases: ['stars'],
    usage: 'constellation [on|off]',
    description: { en: 'Connect the dots', fr: 'Relier les points' },
    group: 'fun',
    hidden: true,
    complete: ({ index }) => (index === 0 ? ['on', 'off'] : []),
    run({ args, t }) {
      const [requested] = args
      if (requested && requested !== 'on' && requested !== 'off') {
        return [line(`constellation: expected \`on\` or \`off\`, got \`${requested}\``, 'error')]
      }

      const on = setConstellation(requested ? requested === 'on' : undefined)
      return [
        line(on ? 'constellation: ON' : 'constellation: OFF', 'primary'),
        ...(on ? announce('constellation', t) : []),
      ]
    },
  },
  {
    name: 'scene',
    usage: 'scene [reset]',
    description: { en: 'Inspect or reset the background', fr: 'Inspecter ou réinitialiser le fond' },
    group: 'fun',
    hidden: true,
    complete: ({ index }) => (index === 0 ? ['reset'] : []),
    run({ args }) {
      const control = useSceneControl()
      if (args[0] === 'reset') {
        resetScene()
        return [line('scene reset.', 'success')]
      }
      if (args.length) return [line(`scene: unknown argument \`${args[0]}\``, 'error')]

      return [
        pre(`shapes         ${control.shapeCount.value}`, 'primary'),
        pre(`gravity        ${control.gravityOn.value ? 'on' : 'off'}`, 'primary'),
        pre(`constellation  ${control.constellationOn.value ? 'on' : 'off'}`, 'primary'),
        blank,
        line('try `spawn 10`, `gravity off`, `constellation on`, `scene reset`.', 'muted'),
        line('clicking a shape tells you what it is.', 'muted'),
      ]
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
