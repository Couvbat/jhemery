/**
 * Runs a JavaScript regular expression over a text and reports every match with its
 * groups. Pure, so the spec calls it directly — but the panel never does: it runs this
 * in `regex.worker.ts`, because a catastrophically backtracking pattern (`(a+)+$`
 * against forty `a`s and a `b`) would otherwise freeze the tab, and a worker is the
 * only thing that can be stopped from outside while it spins.
 */

export const FLAGS = ['g', 'i', 'm', 's', 'u', 'y'] as const
export type Flag = (typeof FLAGS)[number]

/** More than anyone reads; enough that `.` over a long text cannot flood the page. */
export const MAX_MATCHES = 1000

export interface RegexGroup {
  /** The group's number, from 1. */
  index: number
  name?: string
  /** Undefined when the group did not take part in the match. */
  text?: string
  start?: number
  end?: number
}

export interface RegexMatch {
  start: number
  end: number
  text: string
  groups: RegexGroup[]
}

export type RegexResult =
  | { ok: true; matches: RegexMatch[]; truncated: boolean }
  | { ok: false; error: string }

/** Only the flags that change what matches; `d` is added internally for group offsets. */
export function cleanFlags(flags: string): string {
  return [...new Set(flags)].filter((flag) => (FLAGS as readonly string[]).includes(flag)).join('')
}

export function runRegex(pattern: string, flags: string, text: string, limit = MAX_MATCHES): RegexResult {
  let regex: RegExp
  try {
    // `d` gives `indices`, so each group can be highlighted where it actually is.
    regex = new RegExp(pattern, `${cleanFlags(flags)}d`)
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  const names = new Map<number, string>()
  const groupCount = new RegExp(`${pattern}|`, cleanFlags(flags).replace(/[gy]/g, '')).exec('')!.length - 1
  // Named groups come back by name only; recover their numbers by matching the
  // `(?<name>` openings in order against the capturing groups.
  let n = 0
  for (const match of pattern.matchAll(/\\.|\[(?:\\.|[^\]])*\]|\((\?<([A-Za-z_$][\w$]*)>|\?[:=!]|\?<[=!])?/g)) {
    if (!match[0].startsWith('(')) continue
    if (match[1] && !match[2]) continue // non-capturing or lookaround
    n++
    if (match[2]) names.set(n, match[2])
  }

  const matches: RegexMatch[] = []
  const global = regex.global || regex.sticky
  let truncated = false

  for (;;) {
    const found = regex.exec(text)
    if (!found) break
    const indices = (found as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices
    matches.push({
      start: found.index,
      end: found.index + found[0].length,
      text: found[0],
      groups: Array.from({ length: groupCount }, (_, i) => {
        const at = indices?.[i + 1]
        return { index: i + 1, name: names.get(i + 1), text: found[i + 1], start: at?.[0], end: at?.[1] }
      }),
    })
    if (!global) break
    // An empty match would match again at the same place forever.
    if (found[0] === '') regex.lastIndex += regex.unicode && text.codePointAt(regex.lastIndex)! > 0xffff ? 2 : 1
    if (matches.length >= limit) {
      truncated = regex.exec(text) !== null
      break
    }
  }

  return { ok: true, matches, truncated }
}

/** Splits `text` into runs for the panel to render, each tagged with its match (or none). */
export function segments(text: string, matches: readonly RegexMatch[]): Array<{ text: string; match: number | null }> {
  const out: Array<{ text: string; match: number | null }> = []
  let at = 0
  matches.forEach((match, i) => {
    if (match.start < at || match.end === match.start) return
    if (match.start > at) out.push({ text: text.slice(at, match.start), match: null })
    out.push({ text: text.slice(match.start, match.end), match: i })
    at = match.end
  })
  if (at < text.length) out.push({ text: text.slice(at), match: null })
  return out
}
