import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pick } from '@/content/types'
import { privacyCopy, privacyLabels, saveFileLabels } from '@/content/privacy'
import { legalCopy, legalHeadings } from '@/content/legal'
import { securityCopy, securityLabels } from '@/content/security'
import { upcomingLabels } from '@/content/upcoming'
import { stemsLabels } from '@/components/stems/labels'
import { messages } from '../messages'
import { currentLocale, setLocale, useLocale } from '../index'

/**
 * The i18n layer is ~40 lines hand-rolled against a `Localised<T>` shape rather
 * than a library (features-spec §1), so nothing validates the message tree at
 * build time. A key added in English and forgotten in French renders `undefined`
 * on the page for every French visitor with no error anywhere.
 */

type Node = { en: unknown; fr: unknown } | { [key: string]: Node }

function isLocalised(value: unknown): value is { en: unknown; fr: unknown } {
  return typeof value === 'object' && value !== null && 'en' in value
}

/** Walks the message tree and returns `path -> value` for every leaf. */
function flatten(node: Node, path: string[] = []): Array<[string, { en: unknown; fr: unknown }]> {
  if (isLocalised(node)) return [[path.join('.'), node]]
  return Object.entries(node).flatMap(([key, child]) => flatten(child as Node, [...path, key]))
}

/**
 * The message tree, and the tables of interface words kept out of it so that only the
 * lazy page that reads them loads them (the home page is at its byte budget). Same rules.
 */
const leaves = flatten({
  messages,
  privacyLabels,
  saveFileLabels,
  privacyCopy,
  securityLabels,
  securityCopy,
  legalHeadings,
  legalCopy,
  upcomingLabels,
  stemsLabels,
} as unknown as Node)

describe('messages', () => {
  it('finds a non-trivial message tree', () => {
    expect(leaves.length).toBeGreaterThan(20)
  })

  it.each(leaves)('%s is translated in both locales', (path, value) => {
    expect(value.en, `messages.${path}.en is missing`).toBeDefined()
    expect(value.fr, `messages.${path}.fr is missing`).toBeDefined()
    expect(value.en, `messages.${path}.en is empty`).not.toBe('')
    expect(value.fr, `messages.${path}.fr is empty`).not.toBe('')
  })

  it.each(leaves)('%s has the same shape in both locales', (path, value) => {
    // A string in one locale and an array in the other blows up at the call site,
    // which is usually far from the message that caused it.
    expect(Array.isArray(value.fr), `messages.${path} shape differs`).toBe(Array.isArray(value.en))
  })

  // `{n}` and friends are replaced by the caller, whichever locale is on: one missing from
  // a translation drops the number, and one renamed is printed as it is.
  it.each(leaves)('%s keeps the same placeholders in both locales', (path, value) => {
    const holes = (text: unknown) => [...String(text).matchAll(/\{[a-z]+\}/g)].map((m) => m[0]).sort()
    expect(holes(value.fr), `messages.${path}`).toEqual(holes(value.en))
  })
})

describe('pick', () => {
  it('resolves the requested locale', () => {
    expect(pick({ en: 'hello', fr: 'salut' }, 'fr')).toBe('salut')
  })

  it('falls back to English when a translation is missing', () => {
    // The documented escape hatch if maintaining two copies becomes a burden.
    expect(pick({ en: 'hello', fr: undefined as unknown as string }, 'fr')).toBe('hello')
  })

  it('does not treat an empty string as missing', () => {
    expect(pick({ en: 'hello', fr: '' }, 'fr')).toBe('')
  })
})

describe('setLocale', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setLocale('en')
  })

  it('updates the shared locale', () => {
    setLocale('fr')
    expect(currentLocale()).toBe('fr')
  })

  it('persists the choice', () => {
    setLocale('fr')
    expect(window.localStorage.getItem('couvbat:locale')).toBe('fr')
  })

  it('updates <html lang> so screen readers switch voice', () => {
    setLocale('fr')
    expect(document.documentElement.lang).toBe('fr')
  })

  it('is shared across callers rather than giving each its own copy', () => {
    const a = useLocale()
    const b = useLocale()
    a.setLocale('fr')
    expect(b.locale.value).toBe('fr')
  })

  it('resolves through t() in the current locale', () => {
    const { t, setLocale: set } = useLocale()
    const greeting = { en: 'hello', fr: 'salut' }
    set('en')
    expect(t(greeting)).toBe('hello')
    set('fr')
    expect(t(greeting)).toBe('salut')
  })
})

describe('with site data blocked', () => {
  // A browser that blocks site data throws on the `localStorage` getter itself, not on
  // getItem. The locale is read while the module loads, so an unguarded read there
  // failed the import and the app never mounted: a blank page, in either language.
  beforeEach(() => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError')
    })
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('still loads, in the browser’s language', async () => {
    // French, because English is also the default a broken fallback would land on.
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR')
    const { currentLocale: fresh } = await import('../index')
    expect(fresh()).toBe('fr')
  })

  it('still switches, for this page load', async () => {
    const { currentLocale: fresh, setLocale: set } = await import('../index')
    expect(() => set('fr')).not.toThrow()
    expect(fresh()).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
  })
})

// A page's French URL is the same path with `?lang=fr` (content/pages.ts): it is what a
// French search result links to, so it wins over whatever the visitor had stored.
describe('a language in the address', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
  })

  it('wins over the stored choice, and becomes it', async () => {
    window.localStorage.setItem('couvbat:locale', 'en')
    window.history.replaceState(null, '', '/now?lang=fr')
    const { currentLocale: fresh } = await import('../index')
    expect(fresh()).toBe('fr')
    expect(window.localStorage.getItem('couvbat:locale')).toBe('fr')
  })

  it('is ignored when it is not a language the site has', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB')
    window.history.replaceState(null, '', '/now?lang=de')
    const { currentLocale: fresh } = await import('../index')
    expect(fresh()).toBe('en')
    expect(window.localStorage.getItem('couvbat:locale')).toBeNull()
  })
})

describe('toggleLocale', () => {
  it('flips between the two locales', () => {
    const { toggleLocale } = useLocale()
    setLocale('en')
    toggleLocale()
    expect(currentLocale()).toBe('fr')
    toggleLocale()
    expect(currentLocale()).toBe('en')
  })
})
