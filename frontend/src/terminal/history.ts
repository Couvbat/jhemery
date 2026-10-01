import { ref } from 'vue'

const STORAGE_KEY = 'couvbat:history'
const MAX_ENTRIES = 100

function load(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Shared by the session composable and the `history` command. */
export const history = ref<string[]>(load())

export function pushHistory(entry: string) {
  const trimmed = entry.trim()
  if (!trimmed || history.value[history.value.length - 1] === trimmed) return

  history.value = [...history.value, trimmed].slice(-MAX_ENTRIES)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
  } catch {
    // Private browsing or a full quota — history just won't persist.
  }
}

// ---------------------------------------------------------------------------
// Expansion and search, pure
// ---------------------------------------------------------------------------

export type Expansion = { line: string; expanded: boolean } | { error: string }

const lastWord = (entry: string) => entry.trim().split(/\s+/).at(-1) ?? ''

/**
 * Bash's history designators: `!!` the last line, `!$` its last word, `!N` line N as
 * `history` numbers it (`!-N` counting back), and a leading `^old^new` for the last line
 * with its first `old` replaced.
 *
 * A `!` before a space, the end of the line, `=` or `(` is a letter, so `:q!`, `:wq!` and
 * `c'est top !` mean what they say, and `\!` is always one. And nothing at all is expanded
 * on a line that names a command which writes to the server (`isServerBound`), so
 * `sign Great site!!` posts what was typed, not the line before it.
 */
export function expandHistory(
  line: string,
  entries: readonly string[],
  isServerBound: (word: string) => boolean,
): Expansion {
  if (line.split(/\s+/).some(isServerBound)) return { line, expanded: false }
  const last = entries[entries.length - 1]

  const quick = /^\^([^^]+)\^([^^]*)\^?$/.exec(line)
  if (quick) {
    if (!last || !last.includes(quick[1]!)) return { error: `:s^${quick[1]}^${quick[2]}^: substitution failed` }
    return { line: last.replace(quick[1]!, quick[2]!), expanded: true }
  }

  let out = ''
  let expanded = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '\\' && line[i + 1] === '!') {
      out += '!'
      i++
      continue
    }
    const next = line[i + 1]
    if (c !== '!' || next === undefined || /[\s=(]/.test(next)) {
      out += c
      continue
    }
    if (next === '!' || next === '$') {
      if (!last) return { error: `!${next}: event not found` }
      out += next === '!' ? last : lastWord(last)
      i++
      expanded = true
      continue
    }
    const number = /^-?\d+/.exec(line.slice(i + 1))?.[0]
    if (number) {
      const n = Number(number)
      const entry = n > 0 ? entries[n - 1] : n < 0 ? entries[entries.length + n] : undefined
      if (!entry) return { error: `!${number}: event not found` }
      out += entry
      i += number.length
      expanded = true
      continue
    }
    // `!word` (a search by prefix) is bash's too, but nobody types it here: a letter.
    out += c
  }
  return { line: out, expanded }
}

/** The entries starting with `prefix`, newest first, each once: what ↑ walks when there is text. */
export function prefixMatches(entries: readonly string[], prefix: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!
    if (entry.startsWith(prefix) && !seen.has(entry)) {
      seen.add(entry)
      out.push(entry)
    }
  }
  return out
}

/** Ctrl+R: the newest entry containing `query`, before index `before` (all of them by default). */
export function searchBackward(
  entries: readonly string[],
  query: string,
  before: number = entries.length,
): { index: number; entry: string } | undefined {
  if (!query) return undefined
  for (let i = Math.min(before, entries.length) - 1; i >= 0; i--) {
    if (entries[i]!.includes(query)) return { index: i, entry: entries[i]! }
  }
  return undefined
}

/**
 * The rest of the newest entry that starts with what is typed: the faded ghost after the
 * caret. Only the visitor's own history, never the command list or anything Tab offers,
 * so it can't hand out a hidden command; nothing for an empty line.
 */
export function autosuggest(typed: string, entries: readonly string[]): string {
  if (!typed) return ''
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!
    if (entry.length > typed.length && entry.startsWith(typed)) return entry.slice(typed.length)
  }
  return ''
}
