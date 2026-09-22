import { profile, sectionIds, sections, socials, viewIds, views } from '@/content'
import { currentPath, resolvePath } from '@/composables/useViewSwing'
import { prefersReducedMotion } from '@/composables/useCrt'
import { tools } from '@/tools/registry'
import { announce, toast, visitSection } from '../achievements'
import { diffLines, hasChanges } from '../diff'
import { sleep } from '../timing'
import type { Command, OutputLine } from '../types'
import { blank, line, pre, segmented } from '../format'
import { FILES, FILE_ACHIEVEMENTS, HIDDEN_FILES, listFiles, resolveFileLines } from './files'

const PING_COUNT = 4

/** `open`'s destinations, at module scope so Tab and `run` read the same map. */
const OPEN_TARGETS: Record<string, string> = {
  ...Object.fromEntries(socials.map((s) => [s.keyword, s.href])),
  steam: 'https://steamcommunity.com/id/couvbat',
  cv: `https://${profile.domain}/resume.txt`,
  resume: `https://${profile.domain}/resume.txt`,
}

/** A plausible sub-millisecond round trip. */
function latency(): number {
  return 0.02 + Math.random() * 0.08
}

/** Everything `cd`, `ls` and `ping` complete to: sections, the other views, and each
 *  tool as `tools/<id>` — one list, so Tab and the resolver can never disagree. */
function destinations(): string[] {
  return [
    ...sectionIds,
    ...viewIds.filter((id) => id !== 'home'),
    ...tools.map((tool) => `tools/${tool.id}`),
  ]
}

export const navigateCommands: Command[] = [
  {
    name: 'ls',
    usage: 'ls [-a] [path]',
    description: { en: 'List sections, pages and files', fr: 'Lister sections, pages et fichiers' },
    group: 'navigate',
    complete: ({ index, args }) =>
      index === 0 && !args[0]?.startsWith('-')
        ? ['-a', ...destinations()]
        : index <= 1
          ? destinations()
          : [],
    run({ args, t }) {
      const showHidden = args.some((a) => a === '-a' || a === '-la' || a === '-al')
      const target = args.find((a) => !a.startsWith('-'))

      if (target) {
        const resolved = resolvePath(target)
        if (!resolved) {
          return [line(`ls: cannot access '${target}': No such file or directory`, 'error')]
        }
        if (resolved.kind === 'view' && resolved.view.id === 'tools') {
          const listed = resolved.tool ? [resolved.tool] : tools
          return listed.map((tool) =>
            segmented([
              { text: tool.id.padEnd(10), tone: 'primary' },
              { text: t(tool.description), tone: 'muted' },
            ]),
          )
        }
        // A section is an empty directory; `ls /` and `ls ~` fall through to the root.
        if (resolved.kind === 'section' || resolved.view.id !== 'home') return undefined
      }

      const dirs = [
        ...sections.map((s) => t(s.label)),
        ...views.filter((v) => v.id !== 'home').map((v) => t(v.label)),
      ].map((name) => ({ text: `${name}/`.padEnd(14), tone: 'primary' as const, pre: true }))
      const files = FILES.map((f) => ({ text: f, tone: 'default' as const, pre: true }))
      const hidden = showHidden
        ? HIDDEN_FILES.map((f) => ({ text: f, tone: 'muted' as const, pre: true }))
        : []

      return [...dirs, ...files, ...hidden]
    },
  },
  {
    name: 'cd',
    usage: 'cd <section|tools[/<tool>]>',
    description: { en: 'Jump to a section or a page', fr: 'Aller à une section ou une page' },
    group: 'navigate',
    complete: ({ index }) => (index === 0 ? destinations() : []),
    run({ args, navigate, t }) {
      const [target = ''] = args
      const resolved = resolvePath(target)
      if (!resolved || !navigate(target)) {
        return [line(`cd: ${target}: No such file or directory`, 'error')]
      }

      if (resolved.kind === 'section') {
        const unlocks = toast(visitSection(resolved.section.id, sectionIds), t)
        return [line(`~/${t(resolved.section.label)}`, 'muted'), ...unlocks]
      }

      const { view, tool } = resolved
      if (view.id === 'home') {
        // `cd`, `cd ~`, `cd /`: the top of the page counts as visiting the first section.
        const unlocks = toast(visitSection(sections[0]!.id, sectionIds), t)
        return unlocks.length ? unlocks : undefined
      }
      return [line(`~/${t(view.label)}${tool ? `/${tool.id}` : ''}`, 'muted')]
    },
  },
  {
    name: 'pwd',
    description: { en: 'Print where you are', fr: 'Afficher où vous êtes' },
    group: 'navigate',
    run() {
      return [line(`/home/${profile.handle}/${currentPath()}`, 'muted')]
    },
  },
  {
    name: 'cat',
    usage: 'cat <file>',
    description: { en: 'Print a file', fr: 'Afficher un fichier' },
    group: 'navigate',
    complete: ({ index }) => (index === 0 ? listFiles() : []),
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
    // Both operands are filenames, so this one doesn't care which word it's on.
    complete: ({ index }) => (index < 2 ? listFiles() : []),
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
    usage: 'ping <section|page>',
    description: {
      en: 'Ping a section or a page, then go there',
      fr: 'Pinguer une section ou une page, puis y aller',
    },
    group: 'navigate',
    complete: ({ index }) => (index === 0 ? destinations() : []),
    async run(ctx) {
      const [target] = ctx.args
      if (!target) {
        return [line('ping: usage error: Destination address required', 'error')]
      }

      const resolved = resolvePath(target)
      if (!resolved) {
        return [line(`ping: ${target}: Name or service not known`, 'error')]
      }

      const name =
        resolved.kind === 'section'
          ? resolved.section.id
          : resolved.tool
            ? `${resolved.tool.id}.${resolved.view.id}`
            : resolved.view.id
      const host = `${name}.${profile.domain}`
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

      // The payoff: a reachable host is one you can go to.
      ctx.navigate(target)
      if (resolved.kind !== 'section') return undefined
      return toast(visitSection(resolved.section.id, sectionIds), ctx.t)
    },
  },
  {
    name: 'open',
    usage: 'open <github|linkedin|soundcloud|steam|email>',
    description: { en: 'Open an external link', fr: 'Ouvrir un lien externe' },
    group: 'navigate',
    complete: ({ index }) => (index === 0 ? Object.keys(OPEN_TARGETS) : []),
    run({ args }) {
      const [target] = args

      if (!target) {
        return [
          line('open: missing target', 'error'),
          line(`available: ${Object.keys(OPEN_TARGETS).join(', ')}`, 'muted'),
        ]
      }

      const href = OPEN_TARGETS[target.toLowerCase()]
      if (!href) return [line(`open: unknown target \`${target}\``, 'error')]

      window.open(href, '_blank', 'noopener,noreferrer')
      return [line(`opening ${href}`, 'success')]
    },
  },
]
