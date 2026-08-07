import type { OutputLine, OutputSegment, Tone } from './types'

export function line(text: string, tone: Tone = 'default'): OutputLine {
  return { text, tone }
}

export function lines(values: string[], tone: Tone = 'default'): OutputLine[] {
  return values.map((text) => ({ text, tone }))
}

export const blank: OutputLine = { text: '' }

export function pre(text: string, tone: Tone = 'default'): OutputLine {
  return { text, tone, pre: true }
}

/** One line built from differently-toned runs — a game board row. Always `pre`,
 *  since anything needing per-character colour is a grid. */
export function segmented(parts: OutputSegment[]): OutputLine {
  return { text: parts.map((part) => part.text).join(''), segments: parts, pre: true }
}

export function art(block: string, tone: Tone = 'primary'): OutputLine[] {
  return block.split('\n').map((text) => ({ text, tone, pre: true }))
}

export function link(text: string, href: string): OutputLine {
  return { text, href, tone: 'accent' }
}

/** `key → value` rows with the keys padded to a common width. */
export function keyValues(
  rows: Array<{ key: string; value: string }>,
  keyTone: Tone = 'primary',
): OutputLine[] {
  const width = rows.reduce((max, r) => Math.max(max, r.key.length), 0)
  return rows.map((r) => ({
    text: `${r.key.padEnd(width)}  →  ${r.value}`,
    tone: keyTone,
    pre: true,
  }))
}

/** Wraps prose to a column width so long paragraphs stay readable in the buffer. */
export function wrap(text: string, width = 76): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let current = ''

  for (const word of words) {
    if (current.length === 0) {
      current = word
    } else if (current.length + 1 + word.length <= width) {
      current += ` ${word}`
    } else {
      out.push(current)
      current = word
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Word-wraps by **index** rather than by returning strings.
 *
 * `wrap()` above is enough when the caller just wants lines. It is not enough
 * when each character carries its own tone — a typing test colours every
 * character by whether it has been typed correctly, so the renderer needs to
 * know where each wrapped line sits in the original string. Re-deriving those
 * offsets from `wrap()`'s output means trusting that it did not alter any
 * whitespace, which it does.
 *
 * The ranges are contiguous and cover the whole string: the space a line breaks
 * on stays at the end of that line rather than being swallowed, because in a
 * typing test it is a character the player still has to type.
 */
export function wrapRanges(text: string, width: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let start = 0

  while (start < text.length) {
    if (text.length - start <= width) {
      out.push({ start, end: text.length })
      break
    }

    // The break character is kept on this line, so the last position it may sit
    // at is `width - 1` — searching from `width` would produce a line one
    // character over.
    let cut = -1
    for (let i = start + width - 1; i > start; i--) {
      if (text[i] === ' ') {
        cut = i
        break
      }
    }

    // No space to break on: a single word longer than the line. Hard-break it,
    // which is still better than overflowing the panel.
    const end = cut === -1 ? start + width : cut + 1
    out.push({ start, end })
    start = end
  }

  return out
}

export function heading(text: string): OutputLine[] {
  return [
    { text, tone: 'primary' },
    { text: '─'.repeat(text.length), tone: 'muted', pre: true },
  ]
}

/** Comma-separated list of tags, wrapped. */
export function tags(values: readonly string[], tone: Tone = 'accent'): OutputLine[] {
  return wrap(values.join('  ·  ')).map((text) => ({ text, tone }))
}
