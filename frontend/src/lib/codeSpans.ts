/**
 * Copy marks code with backticks, which the terminal prints as they are. A page shows the
 * same text, so it splits on them and renders the odd runs as `<code>` through Vue's
 * interpolation, never as HTML. Unpaired backticks leave the whole text as it is, rather than
 * turning everything after a stray one into code; `work.spec.ts` keeps the copy paired.
 */
export interface CodeSpan {
  text: string
  code: boolean
}

export function codeSpans(text: string): CodeSpan[] {
  const parts = text.split('`')
  if (parts.length % 2 === 0) return [{ text, code: false }]
  return parts.map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((span) => span.text)
}
