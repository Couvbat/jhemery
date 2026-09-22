import { describe, expect, it } from 'vitest'
import { findTool, tools } from '../registry'

/**
 * The same invariants `registry.spec.ts` holds the commands to: the page, `ls tools`,
 * `cd tools/<id>` and the palette all derive from this array, so a duplicate or an
 * untranslated entry degrades four surfaces at once without throwing anywhere.
 */
describe('tool registry', () => {
  it('registers tools', () => {
    expect(tools.length).toBeGreaterThan(0)
  })

  it('uses unique, lowercase, url-safe ids', () => {
    const ids = tools.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it('names and describes every tool in both locales', () => {
    for (const tool of tools) {
      expect(tool.name.en, tool.id).toBeTruthy()
      expect(tool.name.fr, tool.id).toBeTruthy()
      expect(tool.description.en, tool.id).toBeTruthy()
      expect(tool.description.fr, tool.id).toBeTruthy()
    }
  })

  it('finds a tool by id, forgiving a trailing slash and case', () => {
    expect(findTool('image')?.id).toBe('image')
    expect(findTool('IMAGE/')?.id).toBe('image')
    expect(findTool('nope')).toBeUndefined()
  })
})
