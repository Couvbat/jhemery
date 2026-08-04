import { findSection, profile, sectionIds, sections, socials } from '@/content'
import { currentSection } from '@/composables/useActiveSection'
import { prefersReducedMotion } from '@/composables/useCrt'
import { announce, toast, visitSection } from '../achievements'
import { diffLines, hasChanges } from '../diff'
import { sleep } from '../timing'
import type { Command, OutputLine } from '../types'
import { blank, line, pre } from '../format'
import { SECRET_FILE } from './secret'
import { ENV_FILE } from './env-file'
import { resolveFileLines } from './files'

const FILES = ['about.txt', 'skills.txt', 'contact.txt'] as const

/** Hidden files `ls -a` reveals, in listing order. */
const HIDDEN_FILES = [SECRET_FILE, ENV_FILE] as const

/** Reading one of these is worth an achievement. */
const FILE_ACHIEVEMENTS: Record<string, string> = {
  [SECRET_FILE]: 'secret',
  [ENV_FILE]: 'dotenv',
}

const PING_COUNT = 4

/** A plausible sub-millisecond round trip. */
function latency(): number {
  return 0.02 + Math.random() * 0.08
}

export const navigateCommands: Command[] = [
  {
    name: 'ls',
    usage: 'ls [-a]',
    description: { en: 'List sections and files', fr: 'Lister sections et fichiers' },
    group: 'navigate',
    run({ args, t }) {
      const showHidden = args.some((a) => a === '-a' || a === '-la' || a === '-al')

      const dirs = sections.map((s) => ({
        text: `${t(s.label)}/`.padEnd(14),
        tone: 'primary' as const,
        pre: true,
      }))
      const files = FILES.map((f) => ({ text: f, tone: 'default' as const, pre: true }))
      const hidden = showHidden
        ? HIDDEN_FILES.map((f) => ({ text: f, tone: 'muted' as const, pre: true }))
        : []

      return [...dirs, ...files, ...hidden]
    },
  },
  {
    name: 'cd',
    usage: 'cd <section>',
    description: { en: 'Jump to a section', fr: 'Aller à une section' },
    group: 'navigate',
    run({ args, navigate, t }) {
      const [target] = args
      const bare = !target || target === '~' || target === '/'
      const section = bare ? sections[0] : findSection(target)

      if (!section) {
        return [line(`cd: ${target}: No such file or directory`, 'error')]
      }

      navigate(section.id)
      const unlocks = toast(visitSection(section.id, sectionIds), t)
      if (bare) return unlocks.length ? unlocks : undefined
      return [line(`~/${t(section.label)}`, 'muted'), ...unlocks]
    },
  },
  {
    name: 'pwd',
    description: { en: 'Print the current section', fr: 'Afficher la section courante' },
    group: 'navigate',
    run() {
      return [line(`/home/${profile.handle}/${currentSection()}`, 'muted')]
    },
  },
  {
    name: 'cat',
    usage: 'cat <file>',
    description: { en: 'Print a file', fr: 'Afficher un fichier' },
    group: 'navigate',
    run({ args, t }) {
      const [file] = args
      if (!file) return [line('cat: missing operand', 'error')]

      const lines = resolveFileLines(file, t)
      if (!lines) return [line(`cat: ${file}: No such file or directory`, 'error')]

      const achievement = FILE_ACHIEVEMENTS[file]
      return achievement ? [...lines, ...announce(achievement, t)] : lines
    },
  },
  {
    name: 'diff',
    usage: 'diff <file> <file>',
    description: { en: 'Compare two files', fr: 'Comparer deux fichiers' },
    group: 'navigate',
    run({ args, t }) {
      const [left, right] = args
      if (!left || !right) {
        return [line('diff: missing operand', 'error'), line('usage: diff <file> <file>', 'muted')]
      }

      const a = resolveFileLines(left, t)
      if (!a) return [line(`diff: ${left}: No such file or directory`, 'error')]
      const b = resolveFileLines(right, t)
      if (!b) return [line(`diff: ${right}: No such file or directory`, 'error')]

      const ops = diffLines(
        a.map((l) => l.text),
        b.map((l) => l.text),
      )
      const unlocks = announce('diffsy', t)

      if (!hasChanges(ops)) {
        return [line(`diff: ${left} and ${right} are identical`, 'muted'), ...unlocks]
      }

      return [
        pre(`--- ${left}`, 'muted'),
        pre(`+++ ${right}`, 'muted'),
        ...ops.map((op) =>
          op.kind === 'remove'
            ? pre(`- ${op.text}`, 'error')
            : op.kind === 'add'
              ? pre(`+ ${op.text}`, 'success')
              : pre(`  ${op.text}`, 'muted'),
        ),
        ...unlocks,
      ]
    },
  },
  {
    name: 'ping',
    usage: 'ping <section>',
    description: { en: 'Ping a section, then go there', fr: 'Pinguer une section, puis y aller' },
    group: 'navigate',
    async run(ctx) {
      const [target] = ctx.args
      if (!target) {
        return [line('ping: usage error: Destination address required', 'error')]
      }

      const section = findSection(target)
      if (!section) {
        return [line(`ping: ${target}: Name or service not known`, 'error')]
      }

      const host = `${section.id}.${profile.domain}`
      const times: number[] = []
      const replies: OutputLine[] = []

      ctx.print(line(`PING ${host} (127.0.0.1) 56(84) bytes of data.`, 'muted'))
      for (let seq = 1; seq <= PING_COUNT; seq++) {
        const time = latency()
        times.push(time)
        const reply = pre(
          `64 bytes from ${host}: icmp_seq=${seq} ttl=64 time=${time.toFixed(3)} ms`,
          'primary',
        )
        replies.push(reply)
        if (prefersReducedMotion()) continue
        ctx.print(reply)
        await sleep(280, ctx.signal)
      }
      if (prefersReducedMotion()) ctx.print(replies)

      const min = Math.min(...times)
      const max = Math.max(...times)
      const avg = times.reduce((sum, v) => sum + v, 0) / times.length

      ctx.print([
        blank,
        line(`--- ${host} ping statistics ---`, 'muted'),
        line(
          `${PING_COUNT} packets transmitted, ${PING_COUNT} received, 0% packet loss`,
          'muted',
        ),
        pre(`rtt min/avg/max = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)} ms`, 'muted'),
        blank,
      ])

      // The payoff: a reachable section is one you can go to.
      ctx.navigate(section.id)
      return toast(visitSection(section.id, sectionIds), ctx.t)
    },
  },
  {
    name: 'open',
    usage: 'open <github|linkedin|soundcloud|steam|email>',
    description: { en: 'Open an external link', fr: 'Ouvrir un lien externe' },
    group: 'navigate',
    run({ args }) {
      const [target] = args
      const targets: Record<string, string> = {
        ...Object.fromEntries(socials.map((s) => [s.keyword, s.href])),
        steam: 'https://steamcommunity.com/id/couvbat',
        cv: `https://${profile.domain}/resume.txt`,
        resume: `https://${profile.domain}/resume.txt`,
      }

      if (!target) {
        return [
          line('open: missing target', 'error'),
          line(`available: ${Object.keys(targets).join(', ')}`, 'muted'),
        ]
      }

      const href = targets[target.toLowerCase()]
      if (!href) return [line(`open: unknown target \`${target}\``, 'error')]

      window.open(href, '_blank', 'noopener,noreferrer')
      return [line(`opening ${href}`, 'success')]
    },
  },
]
