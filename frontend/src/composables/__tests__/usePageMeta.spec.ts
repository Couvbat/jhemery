import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { profile } from '@/content'
import { pageFor } from '@/content/pages'
import { setLocale } from '@/i18n'
import { applyPageMeta, usePageMeta } from '../usePageMeta'

const site = `https://${profile.domain}`
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
const alternate = (hreflang: string) =>
  document.head.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`)?.getAttribute('href')
const description = () => document.head.querySelector('meta[name="description"]')?.getAttribute('content')
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content')

beforeEach(() => {
  setLocale('en')
  // index.html's own head, as the home page and every route without a copy start.
  document.head.innerHTML = `<link rel="canonical" href="${site}/">
    <link rel="alternate" hreflang="en" href="${site}/">
    <link rel="alternate" hreflang="fr" href="${site}/?lang=fr">
    <link rel="alternate" hreflang="x-default" href="${site}/">
    <meta name="description" content="home">`
})
afterEach(() => setLocale('en'))

describe('applyPageMeta', () => {
  it('names the page in the canonical link, the alternates and the description', () => {
    applyPageMeta('/tools/json')
    expect(canonical()).toBe(`${site}/tools/json`)
    expect(alternate('en')).toBe(`${site}/tools/json`)
    expect(alternate('fr')).toBe(`${site}/tools/json?lang=fr`)
    expect(alternate('x-default')).toBe(`${site}/tools/json`)
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
    expect(alternate('fr')).toBeUndefined()

    applyPageMeta('/work/qr')
    expect(robots()).toBeUndefined()
    expect(canonical()).toBe(`${site}/work/qr`)
    expect(alternate('fr')).toBe(`${site}/work/qr?lang=fr`)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(3)
  })

  // The page shows French, so its canonical is the French URL, as that page's copy says.
  it('describes the page in the visitor’s language, at that language’s URL', () => {
    setLocale('fr')
    applyPageMeta('/now')
    expect(description()).toBe(pageFor('/now')!.description.fr)
    expect(canonical()).toBe(`${site}/now?lang=fr`)
    expect(alternate('en')).toBe(`${site}/now`)
  })
})

describe('usePageMeta', () => {
  async function mount(path: string) {
    const page = defineComponent({ render: () => null })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: page }] })
    const app = createApp(defineComponent({ setup: () => (usePageMeta(), () => h('div')) }))
    app.use(router)
    await router.push(path)
    app.mount(document.createElement('div'))
    return { app, router }
  }

  it('follows the locale', async () => {
    const { app } = await mount('/tools')
    expect(canonical()).toBe(`${site}/tools`)
    setLocale('fr')
    await nextTick()
    expect(canonical()).toBe(`${site}/tools?lang=fr`)
    app.unmount()
  })

  // Left in the address, ?lang=fr would put a visitor who switched to English back in
  // French on the next reload.
  it('takes ?lang= out of the address once the visitor switches away from it', async () => {
    setLocale('fr')
    const { app, router } = await mount('/now?lang=fr&run=help#top')
    setLocale('en')
    await nextTick()
    await router.isReady()
    await new Promise((resolve) => setTimeout(resolve))
    expect(router.currentRoute.value.fullPath).toBe('/now?run=help#top')
    app.unmount()
  })

  it('leaves it there while it is the language showing', async () => {
    setLocale('fr')
    const { app, router } = await mount('/now?lang=fr')
    setLocale('fr')
    await nextTick()
    expect(router.currentRoute.value.query.lang).toBe('fr')
    app.unmount()
  })
})
