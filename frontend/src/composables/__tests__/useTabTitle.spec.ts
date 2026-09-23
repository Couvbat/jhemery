import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// The composable reads index.html's title when it loads, so it has to be there first.
vi.hoisted(() => {
  document.title = 'Site title'
})

import { profile } from '@/content'
import { setLocale } from '@/i18n'
import { tabTitle, useTabTitle } from '../useTabTitle'

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

  it('follows the locale', () => {
    setLocale('fr')
    expect(tabTitle('/tools')).toBe(`Outils & utilitaires — ${profile.name}`)
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
