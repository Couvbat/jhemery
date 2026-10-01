import { fail } from '../format'
import type { Command, CommandContext, OutputLine } from '../types'
import { listFiles, resolveFileLines } from './files'

/**
 * The text commands a pipe is for: `grep`, `head`, `tail`, `wc`, `sort`, `uniq`. Each reads
 * the file it is given, else what came in through the `|`, else says it has nothing to
 * read. They keep the lines they pass on as they were, segments and tones included, so
 * `neofetch | head -n 3` is still in colour.
 *
 * `grep` matches a literal substring and never builds a `RegExp` from what was typed: a
 * pattern from a `?run=` link must not be able to hang the tab (ReDoS).
 */

const NO_INPUT = {
  en: 'nothing to read: pipe something in, or name a file',
  fr: 'rien à lire : envoyez-lui un pipe, ou nommez un fichier',
}

/** Words, with a quoted run (`"two words"`) put back together and unquoted. */
function operands(words: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const quote = word[0]
    if ((quote === '"' || quote === "'") && !(word.length > 1 && word.endsWith(quote))) {
      let j = i
      while (j < words.length - 1 && !words[j]!.endsWith(quote!)) j++
      if (words[j]!.endsWith(quote!) && j > i) {
        out.push(words.slice(i, j + 1).join(' ').slice(1, -1))
        i = j
        continue
      }
    }
    out.push(/^(['"]).*\1$/.test(word) && word.length > 1 ? word.slice(1, -1) : word)
  }
  return out
}

interface Parsed {
  flags: Set<string>
  /** The value of `-n N`, or of `-N`. */
  count?: number
  operands: string[]
}

/** Short flags, combined or not (`-in`), plus the `-n N` and `-N` counts of `head` and `tail`. */
function parse(args: readonly string[], known: string, counted = false): Parsed | string {
  const flags = new Set<string>()
  let count: number | undefined
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (counted && /^-\d+$/.test(arg)) count = Number(arg.slice(1))
    else if (counted && /^-n\d+$/.test(arg)) count = Number(arg.slice(2))
    else if (counted && arg === '-n') {
      const value = args[++i]
      if (!value || !/^\d+$/.test(value)) return `option requires a number -- 'n'`
      count = Number(value)
    } else if (/^-[A-Za-z]+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (!known.includes(flag)) return `invalid option -- '${flag}'`
        flags.add(flag)
      }
    } else rest.push(arg)
  }
  return { flags, count, operands: operands(rest) }
}

/** The lines to work on: the named file, else stdin, else nothing to read. */
function input(ctx: CommandContext, name: string, file: string | undefined): OutputLine[] | OutputLine {
  if (file) return resolveFileLines(file, ctx.t) ?? fail(`${name}: ${file}: No such file or directory`)
  return ctx.stdin ?? fail(`${name}: ${ctx.t(NO_INPUT)}`)
}

/** A line with a prefix of its own (`grep -n`, `uniq -c`), its colours kept. */
function prefixed(row: OutputLine, prefix: string): OutputLine {
  const segments = row.segments ?? [{ text: row.text, tone: row.tone }]
  return { ...row, text: `${prefix}${row.text}`, segments: [{ text: prefix, tone: 'muted' }, ...segments], pre: true }
}

const files = ({ index }: { index: number }) => (index < 3 ? listFiles() : [])

function textCommand(spec: Omit<Command, 'group' | 'writes' | 'linkable'>): Command {
  return { group: 'core', writes: 'none', linkable: true, ...spec }
}

export const textCommands: Command[] = [
  textCommand({
    name: 'grep',
    usage: 'grep [-i -v -n -c] <text> [file]',
    description: { en: 'Lines that contain some text', fr: 'Les lignes qui contiennent un texte' },
    complete: ({ index }) => (index === 0 ? ['-i', '-v', '-n', '-c'] : index < 4 ? listFiles() : []),
    run(ctx) {
      const parsed = parse(ctx.args, 'ivnc')
      if (typeof parsed === 'string') return [fail(`grep: ${parsed}`)]
      const [pattern, file] = parsed.operands
      if (pattern === undefined) return [fail('usage: grep [-i -v -n -c] <text> [file]')]
      const lines = input(ctx, 'grep', file)
      if (!Array.isArray(lines)) return [lines]

      const fold = parsed.flags.has('i') ? (text: string) => text.toLowerCase() : (text: string) => text
      const needle = fold(pattern)
      const matched = lines
        .map((row, i) => ({ row, n: i + 1 }))
        .filter(({ row }) => fold(row.text).includes(needle) !== parsed.flags.has('v'))
      if (parsed.flags.has('c')) return [{ text: String(matched.length) }]
      return matched.map(({ row, n }) => (parsed.flags.has('n') ? prefixed(row, `${n}:`) : row))
    },
  }),
  textCommand({
    name: 'head',
    usage: 'head [-n N | -N] [file]',
    description: { en: 'The first lines', fr: 'Les premières lignes' },
    complete: files,
    run(ctx) {
      const parsed = parse(ctx.args, '', true)
      if (typeof parsed === 'string') return [fail(`head: ${parsed}`)]
      const lines = input(ctx, 'head', parsed.operands[0])
      return Array.isArray(lines) ? lines.slice(0, parsed.count ?? 10) : [lines]
    },
  }),
  textCommand({
    name: 'tail',
    usage: 'tail [-n N | -N] [file]',
    description: { en: 'The last lines', fr: 'Les dernières lignes' },
    complete: files,
    run(ctx) {
      const parsed = parse(ctx.args, '', true)
      if (typeof parsed === 'string') return [fail(`tail: ${parsed}`)]
      const lines = input(ctx, 'tail', parsed.operands[0])
      if (!Array.isArray(lines)) return [lines]
      const count = parsed.count ?? 10
      return count ? lines.slice(-count) : []
    },
  }),
  textCommand({
    name: 'wc',
    usage: 'wc [-l -w -c] [file]',
    description: { en: 'Count lines, words and characters', fr: 'Compter lignes, mots et caractères' },
    complete: ({ index }) => (index === 0 ? ['-l', '-w', '-c', ...listFiles()] : index < 4 ? listFiles() : []),
    run(ctx) {
      const parsed = parse(ctx.args, 'lwc')
      if (typeof parsed === 'string') return [fail(`wc: ${parsed}`)]
      const file = parsed.operands[0]
      const lines = input(ctx, 'wc', file)
      if (!Array.isArray(lines)) return [lines]

      // As a file would count: every line ends in a newline.
      const counts = {
        l: lines.length,
        w: lines.reduce((sum, row) => sum + row.text.split(/\s+/).filter(Boolean).length, 0),
        c: lines.reduce((sum, row) => sum + new TextEncoder().encode(row.text).byteLength + 1, 0),
      }
      const asked = parsed.flags.size ? (['l', 'w', 'c'] as const).filter((f) => parsed.flags.has(f)) : (['l', 'w', 'c'] as const)
      const width = Math.max(...asked.map((f) => String(counts[f]).length))
      const columns = asked.map((f) => String(counts[f]).padStart(asked.length > 1 ? width : 0))
      return [{ text: [...columns, ...(file ? [file] : [])].join(' '), pre: true }]
    },
  }),
  textCommand({
    name: 'sort',
    usage: 'sort [-r -n -u] [file]',
    description: { en: 'Sort lines', fr: 'Trier les lignes' },
    complete: ({ index }) => (index === 0 ? ['-r', '-n', '-u', ...listFiles()] : index < 4 ? listFiles() : []),
    run(ctx) {
      const parsed = parse(ctx.args, 'rnu')
      if (typeof parsed === 'string') return [fail(`sort: ${parsed}`)]
      const lines = input(ctx, 'sort', parsed.operands[0])
      if (!Array.isArray(lines)) return [lines]

      // `-n` reads a leading number, as sort does; a line without one sorts as 0.
      const numeric = (text: string) => Number.parseFloat(text.trim()) || 0
      const sorted = [...lines].sort((a, b) =>
        parsed.flags.has('n') ? numeric(a.text) - numeric(b.text) || a.text.localeCompare(b.text) : a.text.localeCompare(b.text),
      )
      if (parsed.flags.has('r')) sorted.reverse()
      if (!parsed.flags.has('u')) return sorted
      const seen = new Set<string>()
      return sorted.filter((row) => !seen.has(row.text) && Boolean(seen.add(row.text)))
    },
  }),
  textCommand({
    name: 'uniq',
    usage: 'uniq [-c] [file]',
    description: { en: 'Fold repeated neighbouring lines', fr: 'Fusionner les lignes voisines identiques' },
    complete: ({ index }) => (index === 0 ? ['-c', ...listFiles()] : index < 3 ? listFiles() : []),
    run(ctx) {
      const parsed = parse(ctx.args, 'c')
      if (typeof parsed === 'string') return [fail(`uniq: ${parsed}`)]
      const lines = input(ctx, 'uniq', parsed.operands[0])
      if (!Array.isArray(lines)) return [lines]

      const runs: { row: OutputLine; count: number }[] = []
      for (const row of lines) {
        const last = runs[runs.length - 1]
        if (last && last.row.text === row.text) last.count++
        else runs.push({ row, count: 1 })
      }
      return runs.map(({ row, count }) => (parsed.flags.has('c') ? prefixed(row, `${String(count).padStart(7)} `) : row))
    },
  }),
]
