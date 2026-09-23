import { describe, expect, it, vi } from 'vitest'
import { findTool, tools, visibleTools } from '../registry'

const admin = vi.hoisted(() => ({ unlocked: false }))
vi.mock('@/lib/admin', () => ({
  isAdmin: { get value() { return admin.unlocked } },
}))

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

  it('hides the admin tier until the owner unlocks it, and never hides it from findTool', () => {
    admin.unlocked = false
    expect(visibleTools().map((t) => t.id)).not.toContain('download')
    expect(visibleTools().every((t) => t.tier !== 'admin')).toBe(true)
    expect(findTool('download')?.tier).toBe('admin')

    admin.unlocked = true
    expect(visibleTools().map((t) => t.id)).toContain('download')
    expect(visibleTools()).toHaveLength(tools.length)
    admin.unlocked = false
  })

  it('finds a tool by id, forgiving a trailing slash and case', () => {
    expect(findTool('image')?.id).toBe('image')
    expect(findTool('IMAGE/')?.id).toBe('image')
    expect(findTool('nope')).toBeUndefined()
  })
})
