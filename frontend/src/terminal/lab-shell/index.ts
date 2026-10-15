import { decorativeMotion } from '@/composables/useMotion'
import { labMachines, type LabNode } from '@/content/lab'
import { announce } from '../achievements'
import { fetchLab } from '../commands/lab'
import { blank, line } from '../format'
import { sleep } from '../timing'
import type { CommandContext, OutputLine } from '../types'
import { answer } from './commands'
import { glances } from './glances'
import { LAB_USER, motd, type LabSession } from './session'

/**
 * `ssh poseidon`: a pretend shell on one of the lab's machines in which every number is
 * real (`docs/superpowers/specs/2026-10-15-lab-shell-design.md`). It is a costume and
 * says so: nothing runs anywhere, no connection is made, and every figure comes from
 * `GET /lab`, which anyone can `curl`. One command's `run()`, a loop over `ctx.prompt()`,
 * so the shell has no special case for it.
 */

export { LAB_USER } from './session'

/** The machine names `ssh` offers for Tab after its own two targets. */
export const labHosts: string[] = labMachines.map((node) => node.id)

/**
 * How `ssh` reads a lab target: the machine and its one account, a refusal worded as a
 * real box would word it, or undefined when the name isn't a lab machine at all.
 */
export function labLogin(target: string): { host: LabNode } | { refused: OutputLine[] } | undefined {
  const [user, name = ''] = target.includes('@') ? target.split('@') : [LAB_USER, target]
  const host = labMachines.find((node) => node.id === name.toLowerCase())
  if (!host) return undefined
  if (user === 'root') {
    return {
      refused: [
        line(`root@${host.id}: Permission denied (publickey).`, 'error'),
        line('root can’t log in over ssh here.', 'muted'),
      ],
    }
  }
  if (user !== LAB_USER) {
    return {
      refused: [
        line(`${user}@${host.id}: Permission denied (publickey).`, 'error'),
        line(`hint: there is exactly one account on ${host.id}, and it is \`${LAB_USER}\`.`, 'muted'),
      ],
    }
  }
  return { host }
}

const connecting = (host: string) => [
  'OpenSSH_9.6p1, OpenSSL 3.0.13',
  `debug1: Connecting to ${host} port 22.`,
  'debug1: Authenticating with public key "id_ed25519"',
  'debug1: Authentication succeeded (publickey).',
]

const closed = (host: LabNode) => line(`Connection to ${host.id} closed.`, 'muted')

export async function labShell(ctx: CommandContext, host: LabNode): Promise<OutputLine[]> {
  // Asked for before the stages play, so the wait is theirs rather than added to them.
  const pending = fetchLab()
  for (const text of connecting(host.id)) {
    ctx.print(line(text, 'muted'))
    if (decorativeMotion() !== 'paused') await sleep(220, ctx.signal)
  }
  const session: LabSession = { host, report: await pending, fetchedAt: Date.now(), locale: ctx.locale }
  ctx.print([blank, ...motd(session)])
  // On reaching the prompt, feed on or off: an achievement that waited on a live service
  // would hold `completionist` hostage to the lab's uptime. Not inside a pipe, where the
  // prompt below is never reached.
  if (ctx.tty) ctx.print(announce('labRat', ctx.t))

  // The machines hopped from, so `exit` after `ssh optimus` lands back on poseidon.
  const hops: LabNode[] = []
  try {
    for (;;) {
      const input = await ctx.prompt(`${LAB_USER}@${session.host.id}:~$`, { inline: true })
      const [name = '', ...args] = input.trim().split(/\s+/)
      if (name === 'exit' || name === 'logout') {
        ctx.print(closed(session.host))
        const previous = hops.pop()
        if (!previous) return []
        session.host = previous
      } else if (name === 'ssh') {
        const login = args[0] ? labLogin(args[0]) : undefined
        if (!args[0]) ctx.print(line('usage: ssh [user@]hostname', 'error'))
        else if (!login) ctx.print(line(`ssh: Could not resolve hostname ${args[0].split('@').pop()}: Name or service not known`, 'error'))
        else if ('refused' in login) ctx.print(login.refused)
        else {
          hops.push(session.host)
          session.host = login.host
          ctx.print([blank, ...motd(session)])
        }
      } else if (name === 'glances') {
        await glances(ctx, session, fetchLab)
      } else if (name === 'clear') {
        ctx.clear()
      } else {
        ctx.print(answer(input, session))
      }
    }
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') throw error
    // Ctrl+C closes every hop at once, innermost first, as killing the outer ssh would.
    ctx.print([session.host, ...hops.reverse()].map(closed))
    return []
  }
}
