/**
 * Format, minify, and — the part `JSON.parse` alone does not give you — say *where*
 * the input stopped being JSON. V8 dropped the offset from most of its messages
 * (`Unexpected token '}', "{"a":}" is not valid JSON`), and every engine words them
 * differently, so the position comes from a scanner of our own: a validating
 * recursive descent over the grammar that stops at the first offending character.
 * `JSON.parse` still does the parsing; the scanner only runs once it has failed.
 */

export type JsonResult =
  | { ok: true; output: string }
  | { ok: false; message: string; line?: number; column?: number }

export type Indent = 2 | 4 | '\t'

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset)
  const lastBreak = before.lastIndexOf('\n')
  return { line: before.split('\n').length, column: offset - lastBreak }
}

class ScanError extends Error {
  constructor(
    readonly offset: number,
    message: string,
  ) {
    super(message)
  }
}

/** The offset and reason of the first error, or `null` for valid JSON. */
export function scanJson(text: string): { offset: number; message: string } | null {
  let i = 0
  // A declaration rather than a `const` arrow: TypeScript only treats a call as
  // never-returning (and narrows `c` after it) when the callee's type is explicit.
  function fail(message: string): never {
    throw new ScanError(i, message)
  }
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++
  }
  const literal = (word: string) => {
    if (!text.startsWith(word, i)) fail(`unexpected character '${text[i]}'`)
    i += word.length
  }

  function value(): void {
    ws()
    const c = text[i]
    if (c === undefined) fail('unexpected end of input')
    if (c === '{') return object()
    if (c === '[') return array()
    if (c === '"') return string()
    if (c === '-' || (c >= '0' && c <= '9')) return number()
    if (c === 't') return literal('true')
    if (c === 'f') return literal('false')
    if (c === 'n') return literal('null')
    fail(`unexpected character '${c}'`)
  }

  function object(): void {
    i++
    ws()
    if (text[i] === '}') {
      i++
      return
    }
    for (;;) {
      ws()
      if (text[i] !== '"') fail('expected a double-quoted property name')
      string()
      ws()
      if (text[i] !== ':') fail("expected ':' after property name")
      i++
      value()
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return
      }
      fail("expected ',' or '}' after property value")
    }
  }

  function array(): void {
    i++
    ws()
    if (text[i] === ']') {
      i++
      return
    }
    for (;;) {
      value()
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ']') {
        i++
        return
      }
      fail("expected ',' or ']' after array element")
    }
  }

  function string(): void {
    i++
    for (;;) {
      const c = text[i]
      if (c === undefined) fail('unterminated string')
      if (c === '"') {
        i++
        return
      }
      if (c === '\\') {
        i++
        const escaped = text[i]
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail('bad unicode escape')
          i += 5
          continue
        }
        if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) fail('bad escape sequence')
        i++
        continue
      }
      if (c < ' ') fail('control character in string')
      i++
    }
  }

  function number(): void {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (!match) fail('malformed number')
    i += match![0].length
  }

  try {
    value()
    ws()
    if (i < text.length) fail('unexpected characters after the value')
    return null
  } catch (error) {
    if (error instanceof ScanError) return { offset: error.offset, message: error.message }
    throw error
  }
}

function failure(text: string, fallback: string): JsonResult {
  const found = scanJson(text)
  if (!found) return { ok: false, message: fallback }
  return { ok: false, message: found.message, ...lineColumn(text, found.offset) }
}

export function formatJson(text: string, indent: Indent = 2): JsonResult {
  try {
    return { ok: true, output: JSON.stringify(JSON.parse(text), null, indent) }
  } catch (error) {
    return failure(text, (error as Error).message)
  }
}

export function minifyJson(text: string): JsonResult {
  try {
    return { ok: true, output: JSON.stringify(JSON.parse(text)) }
  } catch (error) {
    return failure(text, (error as Error).message)
  }
}

/** Size in UTF-8 bytes and line count, for the status row. */
export function jsonStats(text: string): { bytes: number; lines: number } {
  return { bytes: new TextEncoder().encode(text).length, lines: text ? text.split('\n').length : 0 }
}
