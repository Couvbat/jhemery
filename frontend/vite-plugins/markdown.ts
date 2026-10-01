import { githubSlug } from '../src/content/docs'

/**
 * Markdown to HTML for the design notes (`notes.ts`), and only the subset the specs in
 * `docs/superpowers/specs` actually use: headings, paragraphs, lists (nested, ordered or
 * not, with wrapped lines), blockquotes, GFM tables, fenced code, a rule, and inline
 * code, links, emphasis and bare URLs. Hand-written rather than a dependency, like `qr`:
 * thirteen known files, and the two things that matter here, escaping and GitHub's
 * heading ids, are easier to own than to configure.
 *
 * Every text run is escaped, so nothing in a spec becomes markup. Anything outside the
 * subset (an image, raw HTML, a footnote, a setext heading) throws with the file and
 * line, so a new construct fails the build rather than rendering as garbage.
 */

export interface MarkdownOptions {
  /** Named in errors. */
  file: string
  /** Where a link really goes: a sibling spec becomes a note, other repo paths GitHub. */
  rewriteLink: (href: string) => string
}

interface Context extends MarkdownOptions {
  /** GitHub numbers repeated headings (`testing`, `testing-1`); so do we. */
  slugs: Map<string, number>
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A located line: where it came from, for the error a construct outside the subset gets. */
interface Line {
  text: string
  at: number
}

function fail(ctx: Context, at: number, what: string): never {
  throw new Error(`${ctx.file}:${at}: ${what} is not supported by the notes' markdown renderer`)
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const ESCAPABLE = /\\([\\`*_{}[\]()#+\-.!|<>])/g

/** Escaping and emphasis, leaving held runs (`\u0000n\u0000`) where they are. */
function finish(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, '$1<em>$2</em>')
}

function inline(text: string, ctx: Context, at: number): string {
  if (/!\[/.test(text)) fail(ctx, at, 'an image')
  if (/\[\^/.test(text)) fail(ctx, at, 'a footnote')

  const held: string[] = []
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`

  let out = text
    // Code first: nothing inside a code span is markdown.
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) =>
      hold(`<code>${escapeHtml(code.trim() ? code.replace(/^ (.*) $/, '$1') : code)}</code>`),
    )
    .replace(ESCAPABLE, (_, char: string) => hold(escapeHtml(char)))
    // The label keeps the runs already held (its code, its escapes) and is finished in place.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
      hold(`<a href="${escapeHtml(ctx.rewriteLink(href))}">${finish(label)}</a>`),
    )
    .replace(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g, (url) => hold(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`))

  if (/<\/?[a-zA-Z][^>]*>/.test(out.replace(/\u0000\d+\u0000/g, ''))) fail(ctx, at, 'raw HTML')

  out = finish(out)

  // Held runs can contain held runs (a link's label holds its code), so restore until none are left.
  while (/\u0000\d+\u0000/.test(out)) out = out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]!)
  return out
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/

const indentOf = (text: string) => /^\s*/.exec(text)![0].length
const isBlank = (text: string) => !text.trim()

function startsBlock(lines: Line[], i: number): boolean {
  const text = lines[i]!.text
  return (
    FENCE.test(text) ||
    HEADING.test(text) ||
    RULE.test(text) ||
    QUOTE.test(text) ||
    ITEM.test(text) ||
    (TABLE_ROW.test(text) && TABLE_SEPARATOR.test(lines[i + 1]?.text ?? ''))
  )
}

/** Splits a table row on its unescaped pipes; `\|` is a literal pipe, in code too. */
function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

interface Block {
  html: string
  /** A paragraph, which a tight list item shows without its `<p>`. */
  paragraph?: string
}

function blocks(lines: Line[], ctx: Context): Block[] {
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const { text, at } = lines[i]!
    if (isBlank(text)) {
      i++
      continue
    }

    const fence = FENCE.exec(text)
    if (fence) {
      const close = fence[1]!
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.text.trim().startsWith(close)) body.push(lines[i++]!.text)
      if (i >= lines.length) fail(ctx, at, 'an unclosed code fence')
      i++
      const indent = indentOf(text)
      const code = body.map((l) => l.slice(Math.min(indent, indentOf(l)))).join('\n')
      const lang = fence[2] ? ` class="language-${escapeHtml(fence[2])}"` : ''
      out.push({ html: `<pre><code${lang}>${escapeHtml(code)}</code></pre>` })
      continue
    }

    const heading = HEADING.exec(text)
    if (heading) {
      const level = heading[1]!.length
      const base = githubSlug(heading[2]!)
      const count = ctx.slugs.get(base) ?? 0
      ctx.slugs.set(base, count + 1)
      const id = count ? `${base}-${count}` : base
      out.push({ html: `<h${level} id="${escapeHtml(id)}">${inline(heading[2]!, ctx, at)}</h${level}>` })
      i++
      continue
    }

    if (RULE.test(text)) {
      out.push({ html: '<hr>' })
      i++
      continue
    }

    if (TABLE_ROW.test(text) && TABLE_SEPARATOR.test(lines[i + 1]?.text ?? '')) {
      const head = cells(text)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW.test(lines[i]!.text)) rows.push(cells(lines[i++]!.text))
      const th = head.map((cell) => `<th>${inline(cell, ctx, at)}</th>`).join('')
      const tr = rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, ctx, at)}</td>`).join('')}</tr>`).join('\n')
      out.push({ html: `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table>` })
      continue
    }

    if (QUOTE.test(text)) {
      const inner: Line[] = []
      while (i < lines.length && QUOTE.test(lines[i]!.text)) {
        inner.push({ text: lines[i]!.text.replace(/^\s*> ?/, ''), at: lines[i]!.at })
        i++
      }
      out.push({ html: `<blockquote>\n${blocks(inner, ctx).map((b) => b.html).join('\n')}\n</blockquote>` })
      continue
    }

    if (ITEM.test(text)) {
      const [html, next] = list(lines, i, ctx)
      out.push({ html })
      i = next
      continue
    }

    if (/^=+\s*$/.test(lines[i + 1]?.text ?? '') && !isBlank(text)) fail(ctx, at, 'a setext heading')

    const paragraph: string[] = []
    while (i < lines.length && !isBlank(lines[i]!.text) && (paragraph.length === 0 || !startsBlock(lines, i))) {
      paragraph.push(lines[i++]!.text.trim())
    }
    const html = inline(paragraph.join(' '), ctx, at)
    out.push({ html: `<p>${html}</p>`, paragraph: html })
  }
  return out
}

/** A list from line `start`; returns its HTML and the first line after it. */
function list(lines: Line[], start: number, ctx: Context): [string, number] {
  const first = ITEM.exec(lines[start]!.text)!
  const indent = first[1]!.length
  const ordered = /\d/.test(first[2]!)
  const items: string[] = []
  let i = start

  while (i < lines.length) {
    const marker = ITEM.exec(lines[i]!.text)
    if (!marker || marker[1]!.length !== indent || /\d/.test(marker[2]!) !== ordered) break
    // Lines belonging to this item: its own text, then anything indented past the
    // marker, then a lazy continuation of its first paragraph.
    const contentIndent = indent + marker[2]!.length + 1
    const body: Line[] = [{ text: marker[3]!, at: lines[i]!.at }]
    let loose = false
    i++
    while (i < lines.length) {
      const { text, at } = lines[i]!
      if (isBlank(text)) {
        const next = lines[i + 1]
        if (next && !isBlank(next.text) && indentOf(next.text) >= contentIndent) {
          loose = true
          body.push({ text: '', at })
          i++
          continue
        }
        break
      }
      const nested = ITEM.exec(text)
      if (indentOf(text) >= contentIndent || (nested && indentOf(text) > indent)) {
        body.push({ text: text.slice(Math.min(contentIndent, indentOf(text))), at })
      } else if (!nested && !startsBlock(lines, i) && !isBlank(body[body.length - 1]!.text)) {
        body.push({ text: text.trim(), at })
      } else break
      i++
    }
    const content = blocks(body, ctx)
    const html = content.map((block) => (!loose && block.paragraph !== undefined ? block.paragraph : block.html)).join('\n')
    items.push(`<li>${html}</li>`)
    // A blank line between two items of the same list doesn't end it.
    if (isBlank(lines[i]?.text ?? 'x')) {
      const next = ITEM.exec(lines[i + 1]?.text ?? '')
      if (next && next[1]!.length === indent) i++
    }
  }

  const tag = ordered ? 'ol' : 'ul'
  return [`<${tag}>\n${items.join('\n')}\n</${tag}>`, i]
}

/** The rendered body of one markdown document, and its `# ` title. */
export function renderMarkdown(source: string, options: MarkdownOptions): { html: string; title: string } {
  const ctx: Context = { ...options, slugs: new Map() }
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map((text, n) => ({ text, at: n + 1 }))
  const html = blocks(lines, ctx)
    .map((b) => b.html)
    .join('\n')
  const title = /^#\s+(.*)$/m.exec(source)?.[1]?.trim() ?? options.file
  return { html, title }
}
