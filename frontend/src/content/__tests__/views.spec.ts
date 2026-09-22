import { describe, expect, it } from 'vitest'
import { findView, viewFor, viewIndex, views } from '../views'

/**
 * `views.ts` is the prism. Its order is load-bearing (it decides which way a swing
 * turns) and `home` has to be the first face, because that is where `cd` with no
 * argument goes and what an unknown route swings away from.
 */
describe('views', () => {
  it('starts with home at /', () => {
    expect(views[0]).toMatchObject({ id: 'home', path: '/' })
  })

  it('has unique ids and paths', () => {
    expect(new Set(views.map((v) => v.id)).size).toBe(views.length)
    expect(new Set(views.map((v) => v.path)).size).toBe(views.length)
  })

  it('names every view in both locales', () => {
    for (const view of views) {
      expect(view.label.en, view.id).toBeTruthy()
      expect(view.label.fr, view.id).toBeTruthy()
      expect(view.heading.en, view.id).toBeTruthy()
      expect(view.heading.fr, view.id).toBeTruthy()
    }
  })

  it('finds a view by id or label, forgiving slashes and case', () => {
    expect(findView('tools')?.id).toBe('tools')
    expect(findView('/tools/')?.id).toBe('tools')
    expect(findView('TOOLS')?.id).toBe('tools')
    expect(findView('nope')).toBeUndefined()
  })

  it('maps a route path to its view, sub-paths included', () => {
    expect(viewFor('/')?.id).toBe('home')
    expect(viewFor('/tools')?.id).toBe('tools')
    expect(viewFor('/tools/image')?.id).toBe('tools')
    // `home` is `/` alone — otherwise every path would be home.
    expect(viewFor('/definitely-not-a-page')).toBeUndefined()
  })

  it('places unknown routes after the last face', () => {
    expect(viewIndex('/')).toBe(0)
    expect(viewIndex('/tools')).toBe(1)
    expect(viewIndex('/definitely-not-a-page')).toBe(views.length)
  })
})
