import { profile } from '@/content'
import { prefersReducedMotion, useCrt } from '@/composables/useCrt'
import { useMusicPlayer } from '@/composables/useMusicPlayer'
import { achievementList, announce, isUnlocked, unlockedCount } from '../achievements'
import { blank, line } from '../format'
import type { Command, OutputLine, Tone } from '../types'
import { uptime } from './content'

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

export const systemCommands: Command[] = [
  {
    name: 'ps',
    aliases: ['ps aux', 'ps -ef'],
    description: { en: 'Snapshot of running processes', fr: 'Instantané des processus' },
    group: 'fun',
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
    hidden: true,
    async run(ctx) {
      const frames = prefersReducedMotion() ? 1 : 6
      // Redraws one table in place. It used to `clear()` between frames, which
      // stopped the frames stacking but took the whole scrollback with them.
      const draw = ctx.frame()

      for (let i = 0; i < frames; i++) {
        // Deliberately not reshuffled per frame: with a full repaint the churn
        // read as "live", but redrawing in place just teleports the rows. The
        // jittered %CPU/%MEM is what sells it now.
        const procs = processes()
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
    name: 'achievements',
    aliases: ['trophies'],
    usage: 'achievements',
    description: { en: 'Your progress finding secrets', fr: 'Votre progression' },
    group: 'fun',
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
