// @vitest-environment node
// The notes' renderer runs at build time, in Node, like the résumé plugin.
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../../vite-plugins/markdown'

const render = (source: string, rewriteLink = (href: string) => href) =>
  renderMarkdown(source, { file: 'test.md', rewriteLink }).html

describe('the notes’ markdown', () => {
  it('gives headings GitHub’s ids, numbering repeats', () => {
    const html = render('# Title\n## Testing\n## Testing\n### `tetris` — reversing a decision')
    expect(html).toContain('<h1 id="title">Title</h1>')
    expect(html).toContain('<h2 id="testing">Testing</h2>')
    expect(html).toContain('<h2 id="testing-1">Testing</h2>')
    expect(html).toContain('<h3 id="tetris--reversing-a-decision"><code>tetris</code> — reversing a decision</h3>')
  })

  it('joins a wrapped paragraph and escapes it', () => {
    expect(render('One line\nand the next: 1 < 2 & "so" it\'s')).toBe(
      '<p>One line and the next: 1 &lt; 2 &amp; &quot;so&quot; it&#39;s</p>',
    )
  })

  it('renders inline code, emphasis and links, rewriting the link', () => {
    const html = render('A `<iframe>`, **bold**, *italic* and [the spec](./x.md#y).', (href) => `/rewritten/${href}`)
    expect(html).toBe(
      '<p>A <code>&lt;iframe&gt;</code>, <strong>bold</strong>, <em>italic</em> and <a href="/rewritten/./x.md#y">the spec</a>.</p>',
    )
  })

  it('keeps code inside a link label', () => {
    expect(render('[`MusicSection.vue`](../a.vue)')).toBe('<p><a href="../a.vue"><code>MusicSection.vue</code></a></p>')
  })

  it('links a bare URL, leaving the full stop after it', () => {
    expect(render('See https://example.com/a.')).toBe('<p>See <a href="https://example.com/a">https://example.com/a</a>.</p>')
  })

  // Found in review: the URL took in the link's held marker, and the restored link's
  // quotes closed the outer href early, so its text became attributes.
  it('stops a bare URL where a link glued to it starts', () => {
    expect(render('see https://example.com/[x](https://a.b/c) end')).toBe(
      '<p>see <a href="https://example.com/">https://example.com/</a><a href="https://a.b/c">x</a> end</p>',
    )
  })

  it('never puts markup inside an href, whatever is glued to what', () => {
    for (const source of [
      'see https://example.com/[x](https://a.b/onmouseover=alert`1`) end',
      '[a](https://x.y/`code`) and https://p.q/`r`',
      'https://u.v/\\*w\\*[l](m)',
    ]) {
      const html = render(source)
      for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href, source).not.toMatch(/[<>]/)
      expect(html.match(/<a /g)?.length ?? 0, source).toBe(html.match(/<\/a>/g)?.length ?? 0)
    }
  })

  it('renders a fenced block with its language, escaped and verbatim', () => {
    expect(render('```ts\nconst a = 1 < 2 && **not bold**\n```')).toBe(
      '<pre><code class="language-ts">const a = 1 &lt; 2 &amp;&amp; **not bold**</code></pre>',
    )
  })

  it('renders a table, with an escaped pipe in a code cell', () => {
    const html = render('| a | b |\n|---|---|\n| `x \\| y` | **z** |')
    expect(html).toContain('<thead><tr><th>a</th><th>b</th></tr></thead>')
    expect(html).toContain('<tr><td><code>x | y</code></td><td><strong>z</strong></td></tr>')
  })

  it('nests lists by indentation, joining wrapped items', () => {
    const html = render('1. First\n   continues\n   - nested\n     wraps\n   - second\n2. Two')
    expect(html).toBe(
      '<ol>\n<li>First continues\n<ul>\n<li>nested wraps</li>\n<li>second</li>\n</ul></li>\n<li>Two</li>\n</ol>',
    )
  })

  it('renders a blockquote holding paragraphs and code', () => {
    const html = render('> **Note.** First\n>\n> ```\n> code\n> ```\n>\n> - item')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<p><strong>Note.</strong> First</p>')
    expect(html).toContain('<pre><code>code</code></pre>')
    expect(html).toContain('<ul>\n<li>item</li>\n</ul>')
  })

  it('renders a rule', () => {
    expect(render('a\n\n---\n\nb')).toBe('<p>a</p>\n<hr>\n<p>b</p>')
  })

  // A construct outside the subset fails the build, naming the file and line.
  it.each([
    ['an image', '![alt](x.png)'],
    ['raw HTML', 'text <div>html</div>'],
    ['a footnote', 'claim[^1]'],
    ['a setext heading', 'Title\n====='],
    ['an unclosed code fence', '```\nnever closed'],
  ])('refuses %s', (what, source) => {
    expect(() => render(`\n${source}`)).toThrow(new RegExp(`test\\.md:\\d+: ${what}`))
  })
})
