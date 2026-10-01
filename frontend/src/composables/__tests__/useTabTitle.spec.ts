import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// The composable reads index.html's title when it loads, so it has to be there first.
vi.hoisted(() => {
  document.title = 'Site title'
})

import { profile, work } from '@/content'
import { setLocale } from '@/i18n'
import { pageLabel, tabTitle, useTabTitle } from '../useTabTitle'

afterEach(() => setLocale('en'))

describe('tabTitle', () => {
  it('keeps the site title on the home page and the 404', () => {
    expect(tabTitle('/')).toBe('Site title')
    expect(tabTitle('/definitely-not-a-page')).toBe('Site title')
  })

  it('names the view, or the tool open inside it', () => {
    expect(tabTitle('/tools')).toBe(`Tools & utilities — ${profile.name}`)
    expect(tabTitle('/tools/json')).toBe(`JSON formatter — ${profile.name}`)
    expect(tabTitle('/tools/nope')).toBe(`Tools & utilities — ${profile.name}`)
  })

  it('adds a room code, normalised, and drops one that is not a code', () => {
    expect(tabTitle('/watch')).toBe(`Watch party — ${profile.name}`)
    expect(tabTitle('/watch/ab3de')).toBe(`Watch party · AB3DE — ${profile.name}`)
    expect(tabTitle('/radio/abcd')).toBe(`Radio — ${profile.name}`)
  })

  it('names the pages outside the prism: /now, and a case study by its part', () => {
    expect(tabTitle('/now')).toBe(`What I’m doing now — ${profile.name}`)
    expect(tabTitle('/work/qr')).toBe(`${work.find((p) => p.id === 'qr')!.name.en} — ${profile.name}`)
    // An unknown part still names the page it is on, which says so in its body.
    expect(tabTitle('/work/nope')).toBe(`How this site is built — ${profile.name}`)
  })

  it('follows the locale', () => {
    setLocale('fr')
    expect(tabTitle('/tools')).toBe(`Outils & utilitaires — ${profile.name}`)
  })
})

// What a page change announces. The tab keeps the site title on the 404, for the
// crawlers; the announcement must not call the 404 the home page.
describe('pageLabel', () => {
  it('is the tab title wherever the tab names the page', () => {
    for (const path of ['/', '/tools', '/tools/json', '/watch/ab3de', '/now', '/work/qr', '/work/nope']) {
      expect(pageLabel(path), path).toBe(tabTitle(path))
    }
  })

  it('names the 404 for what it is, in both languages', () => {
    expect(pageLabel('/definitely-not-a-page')).toBe(`Page not found — ${profile.name}`)
    expect(pageLabel('/work')).toBe(`Page not found — ${profile.name}`)
    setLocale('fr')
    expect(pageLabel('/ctf')).toBe(`Page introuvable — ${profile.name}`)
  })
})

describe('useTabTitle', () => {
  it('ends on the site title after passing through other views', async () => {
    // The shapes of the real routes; the pages themselves play no part any more.
    const page = defineComponent({ render: () => null })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: page },
        { path: '/tools/:tool?', component: page },
        { path: '/watch/:code?', component: page },
        { path: '/radio/:code?', component: page },
        { path: '/:pathMatch(.*)*', component: page },
      ],
    })
    const app = createApp(defineComponent({ setup: () => (useTabTitle(), () => h('div')) }))
    app.use(router)
    await router.push('/')
    app.mount(document.createElement('div'))

    const titles: string[] = []
    for (const path of ['/tools', '/watch/ab3de', '/']) {
      await router.push(path)
      await nextTick()
      titles.push(document.title)
    }
    expect(titles).toEqual([
      `Tools & utilities — ${profile.name}`,
      `Watch party · AB3DE — ${profile.name}`,
      'Site title',
    ])

    app.unmount()
  })

  it('retitles the page showing when the locale changes', async () => {
    const page = defineComponent({ render: () => null })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/tools/:tool?', component: page }],
    })
    const app = createApp(defineComponent({ setup: () => (useTabTitle(), () => h('div')) }))
    app.use(router)
    await router.push('/tools')
    app.mount(document.createElement('div'))
    expect(document.title).toBe(`Tools & utilities — ${profile.name}`)

    setLocale('fr')
    await nextTick()
    expect(document.title).toBe(`Outils & utilitaires — ${profile.name}`)
    app.unmount()
  })
})
