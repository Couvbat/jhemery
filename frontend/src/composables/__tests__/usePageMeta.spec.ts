import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { profile } from '@/content'
import { pageFor } from '@/content/pages'
import { setLocale } from '@/i18n'
import { applyPageMeta } from '../usePageMeta'

const site = `https://${profile.domain}`
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
const description = () => document.head.querySelector('meta[name="description"]')?.getAttribute('content')
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content')

beforeEach(() => {
  // index.html's own head, as the home page and every route without a copy start.
  document.head.innerHTML = `<link rel="canonical" href="${site}/"><meta name="description" content="home">`
})
afterEach(() => setLocale('en'))

describe('applyPageMeta', () => {
  it('names the page in the canonical link and the description', () => {
    applyPageMeta('/tools/json')
    expect(canonical()).toBe(`${site}/tools/json`)
    expect(description()).toBe(pageFor('/tools/json')!.description.en)
    expect(robots()).toBeUndefined()
  })

  it('gives a room its view’s canonical', () => {
    applyPageMeta('/watch/AB3DE')
    expect(canonical()).toBe(`${site}/watch`)
  })

  it('keeps the 404 out of the index, and gives it back when the visitor moves on', () => {
    applyPageMeta('/definitely-not-a-page')
    expect(robots()).toBe('noindex')
    expect(canonical()).toBeUndefined()

    applyPageMeta('/work/qr')
    expect(robots()).toBeUndefined()
    expect(canonical()).toBe(`${site}/work/qr`)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
  })

  it('describes the page in the visitor’s language', () => {
    setLocale('fr')
    applyPageMeta('/now')
    expect(description()).toBe(pageFor('/now')!.description.fr)
  })
})
