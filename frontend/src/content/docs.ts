/**
 * Names for the repository's docs, shared by everything that links into them: the
 * anchors `why` and the case studies point at, and (roadmap §H) the notes pages that
 * render the specs. One slug rule, so a link can't name an id the page doesn't have.
 */

/**
 * The anchor GitHub gives a heading: the rendered text, lower-cased, with everything
 * but letters, digits, `_`, `-` and spaces dropped, then spaces turned into hyphens. A
 * dropped `—` leaves its two spaces behind, which is where `addendum--real-word-lists`
 * comes from. Markdown is stripped first, as GitHub slugs the rendered text: link
 * targets, emphasis and the backticks of code go; the code itself stays.
 */
export function githubSlug(heading: string): string {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_)(?=\S)([^*_]+?)(?<=\S)\1/g, '$2')
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Slugs for every heading of one document, in order, numbered the way GitHub numbers a
 * repeat (`testing`, `testing-1`, …), so two headings with the same text stay apart.
 */
export function headingSlugs(markdown: string): string[] {
  const seen = new Map<string, number>()
  const slugs: string[] = []
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const heading = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const base = githubSlug(heading[1]!)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    slugs.push(count ? `${base}-${count}` : base)
  }
  return slugs
}

/** `2026-08-04-ctf-flag-chain-design.md` → `ctf-flag-chain`: the date and `-design` go. */
export function noteSlug(file: string): string {
  const name = file.split('/').pop()!.replace(/\.md$/, '')
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-design$/, '')
}
