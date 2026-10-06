// @vitest-environment node
// Reads the docs off disk to check every anchor against the real headings.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decisions, findDecision } from '../decisions'
import { headingSlugs } from '../docs'

const repo = join(process.cwd(), '..')

/** One sentence: nothing ends one before the end, a stop followed by a space being an end
 *  and a dot inside `api.js` or `#89` not. */
const oneSentence = (text: string) => !/[.!?…]\s/.test(text.trim().replace(/[.!?…]$/, ''))

describe('decisions', () => {
  it('has unique kebab-case ids', () => {
    const ids = decisions.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('has the topics the roadmap names', () => {
    for (const id of ['battleship', 'mcp-sdk', 'polling']) expect(findDecision(id), id).toBeDefined()
  })

  it.each(decisions.map((d) => [d.id, d] as const))('%s says everything in both languages', (_id, d) => {
    for (const value of [d.topic, d.chose, d.hindsight, ...d.rejected.flatMap((r) => [r.what, r.because])]) {
      if (!value) continue
      expect(value.en.trim()).toBeTruthy()
      expect(value.fr.trim()).toBeTruthy()
    }
    expect(d.rejected.length).toBeGreaterThan(0)
  })

  // The spec has the long version; `because` points at it in one sentence.
  it.each(decisions.flatMap((d) => d.rejected.map((r) => [d.id, r.because] as const)))('%s: each because is one sentence', (_id, because) => {
    for (const text of [because.en, because.fr]) {
      const stripped = text.replace(/`[^`]*`/g, 'x').replace(/\b(e\.g|i\.e|vs|etc)\./g, 'x')
      expect(oneSentence(stripped), text).toBe(true)
    }
  })

  // What keeps a decision tied to its spec: the anchor has to be a heading that exists.
  it.each(decisions.map((d) => [d.id, d] as const))('%s points at a heading that exists', (_id, d) => {
    const file = join(repo, d.source.doc)
    expect(existsSync(file), d.source.doc).toBe(true)
    expect(headingSlugs(readFileSync(file, 'utf8'))).toContain(d.source.anchor)
  })

  it('names real pull requests', () => {
    for (const d of decisions) if (d.pr !== undefined) expect(Number.isInteger(d.pr) && d.pr > 0, d.id).toBe(true)
  })
})
