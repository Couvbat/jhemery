import { findTool, visibleTools } from '@/tools/registry'
import { decodeBase64, encodeBase64 } from '@/tools/encode/encode'
import { digestText, toHex, type Algorithm } from '@/tools/hash/hash'
import { formatJson } from '@/tools/json/json'
import { blank, fail, line, pre, segmented } from '../format'
import type { Command, CommandContext, OutputLine } from '../types'
import { listFiles, resolveFileLines } from './files'

/** Everything after the command word and any leading `flags`, outer quotes stripped. */
export function operand(raw: string, flags: readonly string[] = []): string {
  let rest = raw.trim().replace(/^\S+\s*/, '')
  for (;;) {
    const match = /^(\S+)\s*/.exec(rest)
    if (!match || !flags.includes(match[1]!)) break
    rest = rest.slice(match[0].length)
  }
  return rest.replace(/^(['"])([\s\S]*)\1$/, '$2')
}

/** A fake-filesystem file as bytes would read: its lines, each ending in a newline. */
function fileText(lines: OutputLine[]): string {
  return lines.map((l) => `${l.text}\n`).join('')
}

/**
 * What a tool works on, and the name to print for it: a file the fake filesystem knows,
 * as its bytes; any other argument, as text (`-`); and with no argument, whatever came in
 * through a `|`, read as a file would be. So `cat about.txt | sha256sum` and
 * `sha256sum about.txt` print the same digest.
 */
function input(ctx: CommandContext, flags: readonly string[] = []): { text: string; name: string } | undefined {
  const given = operand(ctx.raw, flags)
  if (given) {
    const file = resolveFileLines(given, ctx.t)
    return file ? { text: fileText(file), name: given } : { text: given, name: '-' }
  }
  return ctx.stdin ? { text: fileText(ctx.stdin), name: '-' } : undefined
}

/** GNU `base64` wraps at 76 columns; so does this. */
function hardWrap(text: string, width = 76): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += width) out.push(text.slice(i, i + width))
  return out.length ? out : ['']
}

const ALGORITHM_BY_NAME: Record<string, Algorithm> = {
  sha1sum: 'SHA-1',
  sha256sum: 'SHA-256',
  sha512sum: 'SHA-512',
}

/** `crypto.randomUUID` only exists in secure contexts; the fallback is the same v4. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const NO_INPUT = {
  en: 'nothing to read: pass the text or a file name, or pipe it in',
  fr: 'rien à lire : passez le texte ou un nom de fichier, ou envoyez-le par un pipe',
}

/**
 * The terminal's view of the tools page — derived from the same registry the page
 * renders, so a tool that exists on one exists on the other. `cd tools/<id>` is the
 * long form; this is the discoverable one, and the palette entry.
 */
export const toolCommands: Command[] = [
  {
    name: 'tools',
    usage: 'tools [<tool>]',
    description: {
      en: 'List the tools page, or open one of its tools',
      fr: "Lister la page outils, ou ouvrir l'un de ses outils",
    },
    group: 'navigate',
    writes: 'none',
    linkable: true,
    palette: true,
    complete: ({ index }) => (index === 0 ? visibleTools().map((tool) => tool.id) : []),
    run({ args, navigate, t }) {
      const [id] = args
      if (!id) {
        return [
          line('~/tools', 'muted'),
          ...visibleTools().map((tool) =>
            segmented([
              { text: tool.id.padEnd(10), tone: 'primary' },
              { text: t(tool.description), tone: 'muted' },
            ]),
          ),
          blank,
          line(
            t({
              en: 'tools <name> or cd tools/<name> opens one; cd tools opens the page.',
              fr: 'tools <nom> ou cd tools/<nom> en ouvre un ; cd tools ouvre la page.',
            }),
            'muted',
          ),
        ]
      }

      const tool = findTool(id)
      if (!tool || !navigate(`tools/${tool.id}`)) {
        return [fail(`tools: ${id}: No such tool`)]
      }
      return [line(`~/tools/${tool.id}`, 'muted')]
    },
  },
  // The shell versions of the tools page: each imports the same pure module its panel
  // does, so the terminal and the page cannot disagree about a digest or an encoding
  // — the rule `cat` and `vim` follow for files.
  {
    name: 'sha256sum',
    aliases: ['sha1sum', 'sha512sum'],
    usage: 'sha256sum <file|text>',
    description: {
      en: 'Hash a file or some text, as the hash tool does',
      fr: "Hacher un fichier ou du texte, comme l'outil hash",
    },
    group: 'core',
    writes: 'none',
    complete: ({ index }) => (index === 0 ? listFiles() : []),
    async run(ctx) {
      const invoked = ctx.raw.trim().split(/\s+/)[0]!.toLowerCase()
      const algorithm = ALGORITHM_BY_NAME[invoked] ?? 'SHA-256'
      const read = input(ctx)
      if (!read) return [fail(`${invoked}: ${ctx.t(NO_INPUT)}`)]
      return [pre(`${toHex(await digestText(algorithm, read.text))}  ${read.name}`)]
    },
  },
  {
    name: 'base64',
    usage: 'base64 [-d] <file|text>',
    description: {
      en: 'Encode or decode base64, as the encode tool does',
      fr: "Encoder ou décoder du base64, comme l'outil encode",
    },
    manual: {
      options: { '-d': { en: 'Decode rather than encode. Line breaks in the input are ignored.', fr: 'Décoder plutôt qu’encoder. Les retours à la ligne sont ignorés.' } },
      examples: [{ command: 'base64 about.txt' }, { command: 'echo aGkK | base64 -d' }],
      seeAlso: ['sha256sum(1)', 'tools(1)'],
    },
    group: 'core',
    writes: (args) => (args[0] === '-d' || args[0] === '--decode' ? 'local' : 'none'),
    complete: ({ index, args }) =>
      index === 0 ? ['-d', ...listFiles()] : index === 1 && args[0] === '-d' ? listFiles() : [],
    run(ctx) {
      const decoding = ctx.args[0] === '-d' || ctx.args[0] === '--decode'
      const read = input(ctx, ['-d', '--decode'])
      if (!read) return [fail(`base64: ${ctx.t(NO_INPUT)}`)]

      if (decoding) {
        try {
          // Line breaks are wrapping, as GNU base64 reads them.
          return decodeBase64(read.text.replace(/\s+/g, '')).split('\n').map((l) => pre(l))
        } catch {
          return [fail('base64: invalid input')]
        }
      }
      return hardWrap(encodeBase64(read.text)).map((l) => pre(l))
    },
  },
  {
    name: 'uuidgen',
    description: { en: 'A random UUID (v4)', fr: 'Un UUID aléatoire (v4)' },
    group: 'core',
    writes: 'none',
    run() {
      return [pre(uuid())]
    },
  },
  {
    name: 'jq',
    usage: 'jq . <json>',
    description: {
      en: 'Pretty-print JSON, as the JSON tool does',
      fr: "Indenter du JSON, comme l'outil JSON",
    },
    group: 'core',
    writes: 'local',
    complete: ({ index }) => (index === 0 ? ['.'] : []),
    run(ctx) {
      if (ctx.args[0] !== '.') {
        return [
          fail('jq: only the identity filter `.` works here — it pretty-prints'),
          line('usage: jq . \'{"a": 1}\'', 'muted'),
        ]
      }
      const read = input(ctx, ['.'])
      if (!read) return [fail(`jq: ${ctx.t(NO_INPUT)}`)]

      const result = formatJson(read.text, 2)
      if (result.ok) return result.output.split('\n').map((l) => pre(l))
      const where = result.line ? ` at line ${result.line}, column ${result.column}` : ''
      return [fail(`jq: error: ${result.message}${where}`)]
    },
  },
]
