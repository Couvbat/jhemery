import { profile } from '@/content'
import { useCrt } from '@/composables/useCrt'
import { decorativeMotion } from '@/composables/useMotion'
import { useMusicPlayer } from '@/composables/useMusicPlayer'
import { sendWave, whenPresent, type WaveResult } from '@/composables/usePresence'
import type { Localised } from '@/content/types'
import { observeRequests, type RequestTrace } from '@/lib/api'
import { achievementList, announce, isUnlocked, unlockedCount } from '../achievements'
import { blank, fail, line } from '../format'
import { isLinkable, resolveLink, visibleCommands, writesOf } from '../registry'
import { traceLines } from '../strace'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine, Tone } from '../types'
import { uptime } from './content'
import { ENV_FILE, envAssignments } from './env-file'
import { systemctl } from './systemctl'

interface Proc {
  pid: number
  state: 'R' | 'S' | 'Z'
  command: string
  cpu: [number, number]
  mem: [number, number]
}

/** A snapshot of the site's own "processes" — some conditional on real page state. */
function processes(): Proc[] {
  const list: Proc[] = [
    { pid: 1, state: 'S', command: 'init', cpu: [0, 0.1], mem: [0.1, 0.2] },
    { pid: 42, state: 'R', command: 'couvsh — this shell', cpu: [55, 92], mem: [12, 19] },
    { pid: 7, state: 'R', command: 'three.js --render-loop', cpu: [14, 38], mem: [8, 15] },
    { pid: 8, state: 'R', command: 'vue-router', cpu: [4, 11], mem: [3, 6] },
    { pid: 9, state: 'S', command: 'guestbook.service', cpu: [0.5, 3], mem: [0.5, 1.5] },
    { pid: 10, state: 'S', command: 'steam-poller', cpu: [0.2, 2], mem: [0.3, 0.8] },
    { pid: 11, state: 'S', command: 'github-sync', cpu: [0.2, 2], mem: [0.3, 0.8] },
    { pid: 12, state: 'S', command: 'konami.listener', cpu: [0, 0.3], mem: [0.1, 0.2] },
    // Permanent gag — the `sudo rm -rf /` easter egg never actually finishes.
    { pid: 66, state: 'Z', command: '[rm -rf /] <defunct>', cpu: [0, 0], mem: [0, 0] },
  ]

  if (useCrt().overdrive.value) {
    list.push({ pid: 13, state: 'R', command: 'crt-shader.ko', cpu: [9, 17], mem: [1.5, 3] })
  }
  // Bumps once `play`/`sign up` requests playback — no "stopped" state to check against.
  if (useMusicPlayer().autoplayNonce.value > 0) {
    list.push({ pid: 14, state: 'R', command: 'soundcloud-embed --autoplay', cpu: [4, 9], mem: [3, 5] })
  }

  return list
}

const GHOST: Proc = {
  pid: 31337,
  state: 'S',
  command: 'ghost --flag=CTF{4a89a7f727a2c302} --next=/llms.txt',
  cpu: [0, 0.1],
  mem: [0.1, 0.1],
}

function jitter([min, max]: [number, number]): string {
  return (Math.random() * (max - min) + min).toFixed(1)
}

function stateTone(state: Proc['state']): Tone {
  return state === 'Z' ? 'muted' : state === 'R' ? 'primary' : 'default'
}

function table(procs: Proc[]): OutputLine[] {
  const rows = procs.map((p) => ({
    pid: String(p.pid),
    cpu: jitter(p.cpu),
    mem: jitter(p.mem),
    state: p.state,
    command: p.command,
  }))

  return [
    { text: 'PID    %CPU  %MEM  STAT  COMMAND', tone: 'muted', pre: true },
    ...rows.map((r) => ({
      text: `${r.pid.padEnd(7)}${r.cpu.padStart(4)}  ${r.mem.padStart(4)}  ${r.state.padEnd(4)}  ${r.command}`,
      tone: stateTone(r.state),
      pre: true,
    })),
  ]
}

/**
 * The command `strace` wraps, resolved the way a link resolves one: without the visitor's
 * aliases, so `strace ls` traces `ls` whatever `ls` is aliased to.
 */
function traced(args: readonly string[]) {
  return args.length ? resolveLink(args.join(' ')) : undefined
}

const strace: Command = {
  name: 'strace',
  usage: 'strace <command> [args]',
  description: {
    en: 'The requests a command makes, and the shape of what they carry',
    fr: 'Les requêtes d’une commande, et la forme de ce qu’elles transportent',
  },
  group: 'core',
  // It writes whatever it runs writes, so `?run=strace sign x` is refused like `sign x`.
  writes: (args) => {
    const inner = traced(args)
    return inner && inner.command.name !== 'strace' ? writesOf(inner.command, inner.args) : 'none'
  },
  linkable: (args) => {
    const inner = traced(args)
    return !!inner && inner.command.name !== 'strace' && isLinkable(inner.command, inner.args)
  },
  // The command first, then whatever that command offers: so a link's arguments are held
  // to the inner command's own list, as they would be without strace.
  complete: ({ args, index, word }) => {
    const names = visibleCommands()
      .flatMap((c) => [c.name, ...(c.aliases ?? [])])
      .filter((name) => name !== 'strace')
    // A two-word name (`git log`) is offered a word at a time, as the shell reads it.
    if (index === 0) return [...new Set(names.map((name) => name.split(' ')[0]!))]
    const inner = traced(args.slice(0, index))
    if (!inner && index === 1) return names.filter((name) => name.startsWith(`${args[0]} `)).map((name) => name.split(' ')[1]!)
    if (!inner) return []
    const consumed = index - inner.args.length
    return inner.command.complete?.({ args: args.slice(consumed), index: index - consumed, word }) ?? []
  },
  async run(ctx) {
    const inner = traced(ctx.args)
    if (!ctx.args.length) return [fail('strace: must have PROG [ARGS] or -p PID')]
    if (!inner) return [fail(`strace: Can't stat '${ctx.args[0]}': No such file or directory`)]
    if (inner.command.name === 'strace') return [fail('strace: one at a time: it would only trace itself')]

    // Only what the visitor's command asked for: the two pollers mark themselves.
    const traces: RequestTrace[] = []
    const stop = observeRequests((trace) => {
      if (!trace.background) traces.push(trace)
    })
    let exit = 0
    let killed = false
    try {
      await ctx.run(ctx.args.join(' '))
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        ctx.print(fail(String((error as Error)?.message ?? error)))
        exit = 1
      }
      killed = (error as Error)?.name === 'AbortError'
    } finally {
      stop()
    }
    // Some commands keep what they had on Ctrl+C rather than rethrowing (`ask`), so the
    // signal is the truth about whether the run was stopped.
    killed ||= ctx.signal.aborted
    // No request, no trailer: `strace ls` looks exactly like `ls`, stopped or not.
    if (traces.length) {
      ctx.print([...traces.flatMap(traceLines), line(killed ? '+++ killed by SIGINT +++' : `+++ exited with ${exit} +++`, 'muted')])
    }
    if (killed) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  },
}

/**
 * `who` lists one row per other visitor and stops here, the same twelve the field draws
 * a shape for; the rest are one line, so the rows and the line still add up to the count.
 */
export const WHO_ROWS = 12

const UNAVAILABLE: Localised = {
  en: 'presence is unavailable right now — the count needs the live API.',
  fr: 'la présence est indisponible pour l’instant — le compte a besoin de l’API en direct.',
}

/**
 * Everyone on the site as an anonymous tty: `you` first, then `somebody` for each
 * other connection. There is nothing else to show — the stream is one integer — so
 * the rows are the count, drawn the way `who` would.
 */
async function who({ t, signal }: CommandContext): Promise<OutputLine[]> {
  const count = await whenPresent(signal)
  if (count === null) return [line(`who: ${t(UNAVAILABLE)}`, 'muted')]

  const others = Math.max(0, count - 1)
  const shown = Math.min(others, WHO_ROWS)
  const rows: OutputLine[] = [
    { text: 'you       pts/0', tone: 'primary', pre: true },
    ...Array.from({ length: shown }, (_, i) => ({ text: `somebody  pts/${i + 1}`, pre: true })),
  ]
  if (others > shown) {
    rows.push(line(t({ en: `… and ${others - shown} more`, fr: `… et ${others - shown} de plus` }), 'muted'))
  }
  const total =
    others === 0
      ? t({ en: 'just you here. `wall` waves at whoever arrives.', fr: 'vous seul ici. `wall` fait signe à qui arrivera.' })
      : t({
          en: `${count} here now, you included. \`wall\` waves at them.`,
          fr: `${count} personnes ici, vous compris. \`wall\` leur fait signe.`,
        })
  return [...rows, blank, line(total, 'muted')]
}

const WAVE_REPLIES: Record<WaveResult, { text: Localised; tone: Tone }> = {
  sent: {
    text: {
      en: 'waved. Everyone else’s wireframes ripple, and an open terminal says so.',
      fr: 'signe envoyé. Les formes de tous les autres ondulent, et un terminal ouvert le dit.',
    },
    tone: 'success',
  },
  alone: {
    text: { en: 'wall: nobody else is here to wave at.', fr: 'wall : personne d’autre ici à qui faire signe.' },
    tone: 'muted',
  },
  limited: {
    text: { en: 'wall: that is enough waving for a minute.', fr: 'wall : assez de signes pour une minute.' },
    tone: 'warning',
  },
  off: {
    text: { en: 'wall: broadcasts are switched off here.', fr: 'wall : les diffusions sont désactivées ici.' },
    tone: 'muted',
  },
  unavailable: {
    text: { en: 'wall: the wave could not be sent right now.', fr: 'wall : le signe n’a pas pu partir pour l’instant.' },
    tone: 'error',
  },
}

export const systemCommands: Command[] = [
  systemctl,
  strace,
  {
    name: 'who',
    description: { en: 'Who else is on the site, as anonymous ttys', fr: 'Qui d’autre est sur le site, en ttys anonymes' },
    group: 'live',
    writes: 'none',
    linkable: true,
    run: who,
  },
  {
    name: 'wall',
    usage: 'wall',
    description: { en: 'Wave at everyone else on the site', fr: 'Faire signe à tout le monde sur le site' },
    group: 'live',
    // A POST that makes every other visitor's page react: never from a link.
    writes: 'server',
    async run({ args, t, signal }) {
      // A real `wall` broadcasts its arguments. This one carries no text at all, so
      // any it was given are named as dropped rather than silently ignored.
      const dropped = args.length
        ? [line(t({ en: 'messages are not carried — only the wave', fr: 'les messages ne sont pas transmis — seulement le signe' }), 'muted')]
        : []
      const reply = WAVE_REPLIES[await sendWave(signal)]
      return [...dropped, line(t(reply.text), reply.tone)]
    },
  },
  {
    name: 'ps',
    aliases: ['ps aux', 'ps -ef'],
    description: { en: 'Snapshot of running processes', fr: 'Instantané des processus' },
    group: 'fun',
    writes: 'none',
    hidden: true,
    run() {
      return [line(`USER: ${profile.handle}`, 'muted'), ...table(processes())]
    },
  },
  {
    name: 'top',
    aliases: ['htop'],
    description: { en: 'Live-ish process monitor', fr: 'Moniteur de processus en direct' },
    group: 'fun',
    writes: 'none',
    hidden: true,
    async run(ctx) {
      // One frame with motion paused (reduced motion forces that); `calm` keeps a typed
      // command's own animation.
      const frames = decorativeMotion() === 'paused' ? 1 : 6
      // Redraws one table in place. It used to `clear()` between frames, which
      // stopped the frames stacking but took the whole scrollback with them.
      const draw = ctx.frame()

      for (let i = 0; i < frames; i++) {
        // Deliberately not reshuffled per frame: with a full repaint the churn
        // read as "live", but redrawing in place just teleports the rows. The
        // jittered %CPU/%MEM is what sells it now.
        const procs = processes()
        // Stage 6 of the CTF chain (terminal/ctf.ts): a process that only exists on
        // the last frame, so only someone who watched `top` to the end sees it —
        // never `ps`. With motion paused there is one frame, which is the last.
        if (i === frames - 1) procs.push(GHOST)
        const load = (Math.random() * 1.5).toFixed(2)
        draw([
          line(
            `top - ${new Date().toLocaleTimeString(ctx.locale === 'fr' ? 'fr-FR' : 'en-GB')} up ${uptime()}, load average: ${load}`,
            'accent',
          ),
          line(
            `Tasks: ${procs.length} total, ${procs.filter((p) => p.state === 'R').length} running, ${procs.filter((p) => p.state === 'S').length} sleeping, ${procs.filter((p) => p.state === 'Z').length} zombie`,
            'muted',
          ),
          blank,
          ...table(procs),
        ])
        if (i < frames - 1) await sleep(700, ctx.signal)
      }

      return [
        blank,
        line('(press q to quit — well, you already did)', 'muted'),
        ...announce('htop', ctx.t),
      ]
    },
  },
  {
    name: 'env',
    aliases: ['printenv', 'export'],
    description: { en: 'Print the environment', fr: "Afficher l'environnement" },
    group: 'fun',
    writes: 'none',
    hidden: true,
    run({ raw, args, t }) {
      // `export FOO=bar` looks like it should work, so it gets a real answer
      // rather than silently printing the list it was not asked for.
      if (raw.trim().startsWith('export') && args.length > 0) {
        return [
          fail('export: this environment is read-only.'),
          line(`(it is also entirely made up — see \`cat ${ENV_FILE}\`)`, 'muted'),
        ]
      }

      return [
        ...envAssignments(raw.trim().startsWith('export') ? 'declare -x ' : ''),
        blank,
        line(
          t({
            en: 'none of these are real. obviously.',
            fr: 'aucune de ces valeurs n’est réelle. évidemment.',
          }),
          'muted',
        ),
      ]
    },
  },
  {
    name: 'achievements',
    aliases: ['trophies'],
    usage: 'achievements',
    description: { en: 'Your progress finding secrets', fr: 'Votre progression' },
    group: 'fun',
    writes: 'none',
    linkable: true,
    palette: true,
    run({ t }) {
      const total = achievementList.length
      const out: OutputLine[] = [
        line(`🏆 achievements — ${unlockedCount()}/${total} unlocked`, 'accent'),
        blank,
      ]

      for (const achievement of achievementList) {
        out.push(
          isUnlocked(achievement.id)
            ? {
                text: `  ✓ ${t(achievement.title).padEnd(24)}  ${t(achievement.description)}`,
                tone: 'success',
                pre: true,
              }
            : { text: `  ✗ ${'???'.padEnd(24)}  ${t(achievement.hint)}`, tone: 'muted', pre: true },
        )
      }

      out.push(blank, line('poke around the terminal — `help --all` will not spoil these.', 'muted'))
      return out
    },
  },
]
