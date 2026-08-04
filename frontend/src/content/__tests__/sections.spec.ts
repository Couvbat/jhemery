import { describe, expect, it } from 'vitest'
import { findSection, sectionIds, sections } from '../sections'

/**
 * `sections` is the single list behind the navbar, the terminal's `ls`/`cd`/`pwd`,
 * the command palette and every section header. `findSection` is what makes
 * `cd projets` work as well as `cd projects`.
 */
describe('sections', () => {
  it('has no duplicate ids', () => {
    expect(sectionIds).toHaveLength(new Set(sectionIds).size)
  })

  it('keeps sectionIds in step with sections', () => {
    expect(sectionIds).toEqual(sections.map((s) => s.id))
  })

  it('gives every section a prompt and both locales', () => {
    for (const section of sections) {
      expect(section.prompt, `${section.id} has no prompt`).toBeTruthy()
      expect(section.label.en, `${section.id} label.en`).toBeTruthy()
      expect(section.label.fr, `${section.id} label.fr`).toBeTruthy()
      expect(section.heading.en, `${section.id} heading.en`).toBeTruthy()
      expect(section.heading.fr, `${section.id} heading.fr`).toBeTruthy()
    }
  })

  it('uses ids that are safe as DOM anchors', () => {
    // They become element ids and `#hash` scroll targets in the router.
    for (const section of sections) {
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})

describe('findSection', () => {
  it('finds a section by id', () => {
    expect(findSection('projects')?.id).toBe('projects')
  })

  it('finds a section by its French label', () => {
    const withFrenchLabel = sections.find((s) => s.label.fr !== s.id)
    // Only meaningful if at least one label actually differs from its id.
    if (withFrenchLabel) {
      expect(findSection(withFrenchLabel.label.fr)?.id).toBe(withFrenchLabel.id)
    }
    for (const section of sections) {
      expect(findSection(section.label.fr)?.id).toBe(section.id)
      expect(findSection(section.label.en)?.id).toBe(section.id)
    }
  })

  it('is case-insensitive', () => {
    expect(findSection('PROJECTS')?.id).toBe('projects')
  })

  it('tolerates trailing slashes, as `cd projects/` produces', () => {
    expect(findSection('projects/')?.id).toBe('projects')
    expect(findSection('projects///')?.id).toBe('projects')
  })

  it('returns undefined for an unknown name', () => {
    expect(findSection('nope')).toBeUndefined()
  })

  it('returns undefined for an empty name', () => {
    expect(findSection('')).toBeUndefined()
  })
})
