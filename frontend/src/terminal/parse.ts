/**
 * The shell's language: a line is a chain of pipelines joined by `;`, `&&` and `||`, and a
 * pipeline is stages joined by `|`. Pure, so the rules can be read and tested apart from the
 * shell that runs them (`composables/useTerminal.ts`).
 *
 * Quoting is the part that has to be careful, because French is typed here: `c'est`,
 * `qu'est-ce`, `sign l'un et l'autre`. So a quote opens a group only at the start of a word,
 * and closes only on the same quote followed by a space, the end of the line or an
 * operator; anything else is a literal character. Inside a group the operators are text,
 * which is how `sign "great site; love it"` keeps its semicolon. That is all a group does:
 * a stage's words are its text split on spaces, quotes and all, exactly as the shell split
 * every line before there were pipes. Commands have always read their own quoting (`ask`
 * unquotes, `jq` reads its raw JSON), so a line with no operator in it runs as it did.
 *
 * A single `&` and `>` are literal: there is no background job and no file to redirect to.
 */

/** Stages in one line, however they are joined: aliases can't grow a line past it either. */
export const MAX_STAGES = 16

export interface Stage {
  /** The stage as typed, without its env assignments and with its spacing: `ctx.raw`. */
  raw: string
  /** `raw` split on spaces, quotes and all: the words commands have always been given. */
  argv: string[]
  /** Leading `NAME=value` words, which apply to this stage only (`LANG=fr neofetch`). */
  env: Record<string, string>
  /** Where `raw` starts in the line, so an alias can be expanded in place, everything else untouched. */
  at: number
}

export type Operator = ';' | '&&' | '||'

export interface Link {
  /** How this pipeline joins the one before it; null for the first. */
  op: Operator | null
  pipeline: Stage[]
}

export type Parsed = { ok: true; chain: Link[] } | { ok: false; error: string }

// Any space, a no-break one included: the words split on `\s`, so the operators must too.
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)
const ENV = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/

/** The operator starting at `i`, if one does. */
function operatorAt(line: string, i: number): string | null {
  const c = line[i]
  if (c === ';') return ';'
  if (c === '|') return line[i + 1] === '|' ? '||' : '|'
  if (c === '&' && line[i + 1] === '&') return '&&'
  return null
}

/** Where a group opened at `start` closes, or -1 if it never does (and so isn't one). */
function closingQuote(line: string, start: number): number {
  const quote = line[start]
  for (let i = start + 1; i < line.length; i++) {
    if (line[i] !== quote) continue
    const next = i + 1
    if (next >= line.length || isSpace(line[next]) || operatorAt(line, next)) return i
  }
  return -1
}

const unquote = (value: string) => value.replace(/^(['"])([\s\S]*)\1$/, '$2')

function toStage(text: string, words: string[], start: number): Stage {
  // Env words lead, and only count when a command follows them.
  const env: Record<string, string> = {}
  let skip = 0
  while (skip < words.length - 1) {
    const match = ENV.exec(words[skip]!)
    if (!match) break
    env[match[1]!] = unquote(match[2]!)
    skip++
  }
  let raw = text.trimStart()
  for (const word of words.slice(0, skip)) raw = raw.slice(word.length).trimStart()
  const at = start + (text.length - raw.length)
  raw = raw.trimEnd()
  return { raw, argv: raw.split(/\s+/), env, at }
}

export function parseLine(line: string): Parsed {
  const pieces: { text: string; words: string[]; start: number }[] = []
  const ops: string[] = []
  let words: string[] = []
  let word = ''
  let sliceStart = 0
  const endWord = () => {
    if (word) words.push(word)
    word = ''
  }

  for (let i = 0; i < line.length; ) {
    const op = operatorAt(line, i)
    if (op) {
      endWord()
      pieces.push({ text: line.slice(sliceStart, i), words, start: sliceStart })
      ops.push(op)
      words = []
      i += op.length
      sliceStart = i
      continue
    }
    const c = line[i]!
    if (isSpace(c)) {
      endWord()
      i++
      continue
    }
    // At the start of a word, or of an env value (`MSG="a b"`).
    if ((c === '"' || c === "'") && (word === '' || /^[A-Za-z_][A-Za-z0-9_]*=$/.test(word))) {
      const close = closingQuote(line, i)
      if (close > 0) {
        word += line.slice(i, close + 1)
        i = close + 1
        continue
      }
    }
    word += c
    i++
  }
  endWord()
  pieces.push({ text: line.slice(sliceStart), words, start: sliceStart })

  const chain: Link[] = []
  let pipeline: Stage[] = []
  let joined: Operator | null = null
  let stages = 0
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k]!
    const before = ops[k - 1]
    const after = ops[k]
    if (!piece.words.length) {
      // Nothing typed, or a trailing `;`: both are fine. Any other gap is a missing command.
      if (k === pieces.length - 1 && (k === 0 || before === ';')) continue
      return { ok: false, error: `couvsh: syntax error near unexpected token '${after ?? before}'` }
    }
    if (++stages > MAX_STAGES) return { ok: false, error: `couvsh: more than ${MAX_STAGES} commands in one line` }
    pipeline.push(toStage(piece.text, piece.words, piece.start))
    if (after === '|') continue
    chain.push({ op: joined, pipeline })
    pipeline = []
    joined = (after as Operator | undefined) ?? null
  }
  return { ok: true, chain }
}

/**
 * The line with some stages' text replaced (aliases expanded), every other character as
 * it was typed: env words, operators, quotes and spacing. `replace` returns a stage's new
 * text, or undefined to leave it.
 */
export function replaceStages(line: string, chain: readonly Link[], replace: (stage: Stage) => string | undefined): string {
  const stages = chain.flatMap((link) => link.pipeline).sort((a, b) => b.at - a.at)
  let out = line
  for (const stage of stages) {
    const text = replace(stage)
    if (text !== undefined && text !== stage.raw) out = `${out.slice(0, stage.at)}${text}${out.slice(stage.at + stage.raw.length)}`
  }
  return out
}

/**
 * Where the stage being typed starts: just past the last operator outside a group, or 0.
 * Tab completes from there, so `ls | gr<Tab>` completes a command, not an argument of `ls`.
 */
export function lastStageStart(text: string): number {
  let start = 0
  let atWordStart = true
  for (let i = 0; i < text.length; ) {
    const op = operatorAt(text, i)
    if (op) {
      i += op.length
      start = i
      atWordStart = true
      continue
    }
    const c = text[i]!
    if ((c === '"' || c === "'") && atWordStart) {
      const close = closingQuote(text, i)
      if (close > 0) {
        i = close + 1
        atWordStart = false
        continue
      }
    }
    atWordStart = isSpace(c)
    i++
  }
  return start
}
