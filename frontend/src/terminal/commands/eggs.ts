import { profile } from '@/content'
import { fortunePool } from '@/content/fortunes'
import { decorativeMotion } from '@/composables/useMotion'
import {
  MAX_SHAPE_COUNT,
  resetScene,
  setConstellation,
  setGravity,
  setMusicReaction,
  spawnShapes,
  useSceneControl,
} from '@/composables/useSceneControl'
import { isAdmin, lockAdmin, unlockAdmin } from '@/lib/admin'
import { api, ApiError } from '@/lib/api'
import { announce, unlock } from '../achievements'
import { COW, TRAIN } from '../ascii'
import { bannerLines, BANNER_MAX_CHARS } from '../ascii-banner'
import { art, blank, line, link, pre } from '../format'
import { labHosts, labLogin, labShell } from '../lab-shell'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine } from '../types'
import { cacheHeldEntries, filenameFor, forgetGuestbookFile, resolveGuestbookFile, resolveHeldFile } from './guestbook-fs'
import { ENV_FILE } from './env-file'
import { listFiles, resolveFileLines } from './files'

/** The registration record `whois` invents for this domain. */
/** The target `/etc/shadow` names, ROT13'd there as `tvofba`. */
const GIBSON = 'gibson'

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

/**
 * Instant with motion paused (reduced motion forces that), animated otherwise. A typed
 * command's own animation is something the visitor asked for by name, so `calm` keeps it.
 */
function still(): boolean {
  return decorativeMotion() === 'paused'
}

async function paced(ctx: CommandContext, output: OutputLine[], stepMs: number) {
  if (still()) {
    ctx.print(output)
    return
  }
  for (const item of output) {
    ctx.print(item)
    await sleep(stepMs, ctx.signal)
  }
}

/**
 * `sudo -i`: the owner's unlock. The password is checked against the API and kept
 * for the tab (`lib/admin.ts`), which is what makes the admin tier of the tools page
 * appear. The prompt is masked, as for `sudo rm`.
 */
async function elevate(ctx: CommandContext): Promise<OutputLine[]> {
  if (isAdmin.value) {
    return [line(`root@${profile.host}:~# already root — sudo -k drops it`, 'muted')]
  }
  const password = await ctx.prompt('[sudo] password for visitor:', { mask: true })
  if (!password) return [line('sudo: no password entered', 'error')]

  const result = await unlockAdmin(password)
  if (result === 'wrong') return [line('Sorry, try again.', 'error')]
  if (result === 'unreachable') {
    return [line('sudo: unable to reach the API to check that', 'error')]
  }
  return [
    line(`root@${profile.host}:~#`, 'success'),
    line(
      ctx.t({
        en: 'the admin tools are on the tools page now — `tools`, or `cd tools/download`. `sudo -k` locks again.',
        fr: 'les outils admin sont sur la page outils — `tools`, ou `cd tools/download`. `sudo -k` verrouille.',
      }),
      'muted',
    ),
  ]
}

/** One of two real things `sudo` can do — remove a guestbook entry, given the admin password. */
async function removeGuestbookEntry(
  ctx: CommandContext,
  target: string,
): Promise<OutputLine[]> {
  // A held entry too, by the `held/<file>` name `sudo guestbook held` gave it.
  const entry = resolveGuestbookFile(target) ?? resolveHeldFile(target)
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

/**
 * `sudo guestbook held`: what the model held, and what it hasn't read yet, as
 * `held/<file>` names with the reason and the age, for the owner only: the API checks
 * the password before it lists anything.
 */
async function listHeld(ctx: CommandContext): Promise<OutputLine[]> {
  const password = await ctx.prompt('[sudo] password for visitor:', { mask: true })
  if (!password) return [line('sudo: no password entered', 'error')]
  let entries: Awaited<ReturnType<typeof api.heldGuestbook>>
  try {
    entries = await api.heldGuestbook(password)
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [line('sudo: incorrect password', 'error')]
    return [line('guestbook: request failed', 'error')]
  }
  cacheHeldEntries(entries)
  if (!entries.length) return [line('nothing held, nothing waiting.', 'muted')]
  const minutes = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`)
  return entries.flatMap((entry) => [
    {
      text: `${entry.status === 'held' ? 'held   ' : 'pending'}  ${(entry.reason ?? '-').padEnd(13)}  ${minutes(entry.ageMs).padStart(6)}  held/${filenameFor(entry)}`,
      tone: entry.status === 'held' ? ('warning' as const) : ('muted' as const),
      pre: true,
    },
    // The entry's own words, as text: the guestbook is the reason output has no markup.
    line(`  ${entry.name}: ${entry.message}`),
  ]).concat([blank, line('`sudo approve held/<file>` publishes one; `sudo rm held/<file>` removes it.', 'muted')])
}

/** `sudo approve <file>`: up, whatever the model said. */
async function approveHeld(ctx: CommandContext, target: string): Promise<OutputLine[]> {
  const entry = resolveHeldFile(target)
  if (!entry) return [line(`approve: ${target}: no such held entry — \`sudo guestbook held\` lists them`, 'error')]
  const password = await ctx.prompt('[sudo] password for visitor:', { mask: true })
  if (!password) return [line('sudo: no password entered', 'error')]
  try {
    await api.approveGuestbookEntry(entry.id, password)
    forgetGuestbookFile(target)
    return [line(`published held/${filenameFor(entry)}`, 'success')]
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return [line('sudo: incorrect password', 'error')]
    if (error instanceof ApiError && error.status === 404) return [line(`approve: ${target}: already gone or already up`, 'error')]
    return [line('approve: request failed', 'error')]
  }
}

export const eggCommands: Command[] = [
  {
    name: 'sudo',
    usage: 'sudo <command>',
    description: { en: 'Execute as superuser', fr: 'Exécuter en superutilisateur' },
    group: 'fun',
    writes: 'server',
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

      if (rest === '-i' || rest === '-s' || rest === 'su' || rest === 'su -') {
        return elevate(ctx)
      }
      if (rest === '-k' || rest === '-K') {
        lockAdmin()
        return [line('sudo: credentials cleared', 'muted')]
      }

      if (rest === 'guestbook held') return listHeld(ctx)
      const approveMatch = /^approve\s+(\S+)$/.exec(rest)
      if (approveMatch) return approveHeld(ctx, approveMatch[1]!)

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
    writes: 'none',
    hidden: true,
    run({ effects, close, t }) {
      const toast = announce('matrix', t)
      if (still()) {
        return [line('Wake up, Neo… (animation skipped: motion paused)', 'primary'), ...toast]
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
    writes: 'none',
    hidden: true,
    run({ effects, close, t }) {
      const toast = announce('reboot', t)
      if (still()) {
        return [line('rebooting… (animation skipped: motion paused)', 'primary'), ...toast]
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
    writes: 'none',
    hidden: true,
    complete: ({ index }) =>
      index === 0
        ? [`${profile.handle}@${profile.domain}`, `contact@${profile.domain}`, ...labHosts]
        : [],
    async run(ctx) {
      const target = ctx.args[0]
      if (!target) {
        return [line('usage: ssh [user@]hostname', 'error')]
      }

      // The lab's machines answer to their own names, with a shell of their own.
      const lab = labLogin(target)
      if (lab) return 'refused' in lab ? lab.refused : labShell(ctx, lab.host)

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
      if (still()) {
        return [blank, line('connected. (boot animation skipped: motion paused)', 'success'), ...toast]
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
    writes: 'none',
    hidden: true,
    complete: ({ index }) => (index === 0 ? [profile.domain, profile.handle] : []),
    run({ args, t }) {
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
        link(t({ en: '>>> the real record, publisher and host: /legal', fr: '>>> la vraie fiche, éditeur et hébergeur : /legal' }), '/legal'),
      ]
    },
  },
  {
    name: 'crt',
    description: { en: 'Toggle CRT overdrive', fr: 'Basculer le mode CRT' },
    group: 'fun',
    writes: 'local',
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
    writes: 'local',
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
    writes: 'local',
    hidden: true,
    run({ effects, raw, t }) {
      const cmd = raw.trim()

      // Escaping vim is the achievement, so there has to be a vim to escape: typed at
      // the prompt, `:q` is only a reflex.
      if (!effects.vimIsOpen()) {
        return [
          line(
            t({
              en: `${cmd}: you're not in vim. The reflex is noted.`,
              fr: `${cmd} : vous n'êtes pas dans vim. Le réflexe est noté.`,
            }),
            'muted',
          ),
        ]
      }

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
    // It prints its target back as output (`nmap -sS -A <target>`).
    writes: (args) => (args[0] ? 'local' : 'none'),
    hidden: true,
    async run(ctx) {
      const target = ctx.args[0] ?? 'mainframe'
      // Stage 5 of the CTF chain (terminal/ctf.ts): the one target `/etc/shadow`
      // names gets in. Every other target still gets denied.
      const gibson = target.toLowerCase() === GIBSON
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
      await paced(ctx, gibson ? [...stages.slice(0, -1), line('escalating privileges  [██████████] 100%', 'primary')] : stages, 260)
      await sleep(still() ? 0 : 600, ctx.signal)
      if (gibson) {
        return [
          blank,
          line('ACCESS GRANTED — hack the planet.', 'success'),
          pre('CTF{f5611df57ef74890}', 'accent'),
          line('next: some processes only show up if you keep watching them.', 'muted'),
          ...announce('hack', ctx.t),
        ]
      }
      return [blank, line('ACCESS DENIED — nice try.', 'error'), ...announce('hack', ctx.t)]
    },
  },
  {
    name: 'coffee',
    aliases: ['brew'],
    description: { en: 'Brew a coffee', fr: 'Préparer un café' },
    group: 'fun',
    writes: 'none',
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
    writes: 'local',
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
    writes: 'local',
    hidden: true,
    run({ args, stdin, t }) {
      // What came in through a `|`, as one line of speech: `fortune | cowsay`.
      const piped = stdin?.map((l) => l.text.trim()).filter(Boolean).join(' ')
      const text = args.join(' ') || piped || 'moo'
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
    writes: 'none',
    hidden: true,
    run({ t }) {
      // Today's pool (`content/fortunes.ts`): a season's day has lines of its own.
      const pool = fortunePool()
      return [line(t(pool[Math.floor(Math.random() * pool.length)]!), 'accent'), ...announce('fortune', t)]
    },
  },
  {
    name: 'sl',
    description: { en: 'You meant ls', fr: 'Vous vouliez dire ls' },
    group: 'fun',
    writes: 'none',
    hidden: true,
    async run(ctx) {
      const rows = TRAIN.split('\n')
      if (still()) {
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
    writes: 'local',
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
    writes: 'local',
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
    writes: 'local',
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
    writes: 'local',
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
    writes: 'local',
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
    usage: 'scene [reset|music on|music off]',
    description: { en: 'Inspect or reset the background', fr: 'Inspecter ou réinitialiser le fond' },
    group: 'fun',
    writes: (args) => (args[0]?.toLowerCase() === 'reset' ? 'local' : 'none'),
    hidden: true,
    complete: ({ index, args }) => (index === 0 ? ['reset', 'music'] : index === 1 && args[0] === 'music' ? ['on', 'off'] : []),
    run({ args }) {
      const control = useSceneControl()
      if (args[0] === 'reset') {
        resetScene()
        return [line('scene reset.', 'success')]
      }
      // Whether the field reacts to the music playing here: for the session, unsaved, as
      // the other flags are.
      if (args[0] === 'music' && (args[1] === 'on' || args[1] === 'off' || args.length === 1)) {
        const on = setMusicReaction(args[1] === undefined ? undefined : args[1] === 'on')
        return [line(on ? 'the field listens to the music.' : 'the field ignores the music.', 'success')]
      }
      if (args.length) return [line(`scene: unknown argument \`${args[0]}\``, 'error')]

      return [
        pre(`shapes         ${control.shapeCount.value}`, 'primary'),
        pre(`gravity        ${control.gravityOn.value ? 'on' : 'off'}`, 'primary'),
        pre(`constellation  ${control.constellationOn.value ? 'on' : 'off'}`, 'primary'),
        pre(`music          ${control.musicOn.value ? 'on' : 'off'}`, 'primary'),
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
    writes: 'none',
    hidden: true,
    run() {
      return [line(`couvsh 1.0 ${profile.domain} x86_64 GNU/Portfolio`, 'muted')]
    },
  },
]
