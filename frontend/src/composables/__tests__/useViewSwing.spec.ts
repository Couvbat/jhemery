import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { NavigationHookAfter, RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'

const motion = { reduced: false }
vi.mock('@/composables/useCrt', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

const scrolled = vi.fn((_id: string) => true)
vi.mock('@/composables/useActiveSection', () => ({
  scrollToSection: (id: string) => scrolled(id),
  currentSection: () => 'projects',
}))

import {
  SWING_MS,
  activeView,
  currentPath,
  goTo,
  installViewSwing,
  resolvePath,
  useViewSwing,
  type SwingRouter,
} from '../useViewSwing'

/**
 * The clock the page transition and the three.js field both read. Direction and
 * the no-swing cases are decided here, from the view order; the DOM and the shapes
 * only ever consume the result. Reduced motion is the one branch where nothing
 * moves, and it has to be a branch *here*, not in each reader.
 */

function route(path: string, hash = ''): RouteLocationNormalizedLoaded {
  return {
    path,
    hash,
    fullPath: path + hash,
    // The router's START_LOCATION has an empty `matched`; every real route has one entry.
    matched: [{}],
  } as unknown as RouteLocationNormalizedLoaded
}

function fakeRouter(initial = '/') {
  const currentRoute = ref(route(initial))
  let hook: NavigationHookAfter = () => {}
  const push = vi.fn((to: RouteLocationRaw) => {
    const from = currentRoute.value
    const next =
      typeof to === 'string'
        ? route(to)
        : route('path' in to && to.path ? to.path : from.path, 'hash' in to ? (to.hash ?? '') : '')
    currentRoute.value = next
    hook(next, from, undefined)
    return Promise.resolve(undefined)
  })
  const router = {
    currentRoute,
    push,
    afterEach: (fn: NavigationHookAfter) => {
      hook = fn
      return () => {}
    },
  } as unknown as SwingRouter
  return { router, push, hook: () => hook }
}

/** A hand-cranked requestAnimationFrame: nothing runs until `advance()` is called. */
let frames: FrameRequestCallback[] = []
function advance(time: number) {
  const due = frames
  frames = []
  for (const callback of due) callback(time)
}

beforeEach(() => {
  motion.reduced = false
  frames = []
  scrolled.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

describe('resolvePath', () => {
  it('treats nothing, ~ and / as home', () => {
    for (const target of ['', '~', '/', ' ~/ ']) {
      expect(resolvePath(target)).toMatchObject({ kind: 'view', view: { id: 'home' } })
    }
  })

  it('resolves sections, with a home prefix or trailing slash forgiven', () => {
    expect(resolvePath('projects')).toMatchObject({ kind: 'section', section: { id: 'projects' } })
    expect(resolvePath('~/projects/')).toMatchObject({ kind: 'section', section: { id: 'projects' } })
  })

  it('resolves views and their tools', () => {
    expect(resolvePath('tools')).toMatchObject({ kind: 'view', view: { id: 'tools' } })
    expect(resolvePath('/tools/image')).toMatchObject({
      kind: 'view',
      view: { id: 'tools' },
      tool: { id: 'image' },
    })
  })

  it('resolves a room code under watch or radio, in any case', () => {
    expect(resolvePath('watch/ab3de')).toMatchObject({ kind: 'view', view: { id: 'watch' }, code: 'AB3DE' })
    expect(resolvePath('/radio/AB3DE/')).toMatchObject({ kind: 'view', view: { id: 'radio' }, code: 'AB3DE' })
    expect(resolvePath('watch/abcd')).toBeUndefined()
    expect(resolvePath('watch/ab3de/x')).toBeUndefined()
  })

  it('refuses what does not exist, including sub-paths of things that have none', () => {
    expect(resolvePath('nope')).toBeUndefined()
    expect(resolvePath('tools/nope')).toBeUndefined()
    expect(resolvePath('tools/image/deeper')).toBeUndefined()
    expect(resolvePath('projects/anything')).toBeUndefined()
  })
})

describe('installViewSwing', () => {
  it('reads the current view on install', () => {
    const { router } = fakeRouter('/tools')
    installViewSwing(router)
    expect(activeView.value).toBe('tools')
  })

  it('never swings on the first navigation — there is no page to swing away from', () => {
    const { router, hook } = fakeRouter('/')
    installViewSwing(router)

    // START_LOCATION: the router's `from` on the very first navigation matched nothing.
    const start = { ...route('/'), matched: [] } as unknown as RouteLocationNormalizedLoaded
    hook()(route('/tools'), start, undefined)

    expect(activeView.value).toBe('tools')
    expect(useViewSwing().swinging.value).toBe(false)
    expect(frames).toHaveLength(0)
  })

  it('swings forward to a later face and reaches exactly one', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    const { swing, swingDirection, swinging } = useViewSwing()

    void push('/tools')
    expect(activeView.value).toBe('tools')
    expect(swinging.value).toBe(true)
    expect(swingDirection.value).toBe(1)
    expect(swing.value).toBe(0)

    advance(0)
    advance(SWING_MS / 2)
    expect(swing.value).toBeGreaterThan(0)
    expect(swing.value).toBeLessThan(1)
    expect(swinging.value).toBe(true)

    advance(SWING_MS)
    expect(swing.value).toBe(1)
    expect(swinging.value).toBe(false)
  })

  it('swings backward to an earlier face', () => {
    const { router, push } = fakeRouter('/tools')
    installViewSwing(router)
    void push('/')
    expect(useViewSwing().swingDirection.value).toBe(-1)
  })

  it('does not swing within a view — a tool opening, or a hash on the home page', () => {
    const { router, push } = fakeRouter('/tools')
    installViewSwing(router)
    void push('/tools/image')
    expect(useViewSwing().swinging.value).toBe(false)
    expect(activeView.value).toBe('tools')

    const home = fakeRouter('/')
    installViewSwing(home.router)
    void home.push({ path: '/', hash: '#projects' })
    expect(useViewSwing().swinging.value).toBe(false)
  })

  it('treats an unknown route as the face after the last one', () => {
    const { router, push } = fakeRouter('/tools')
    installViewSwing(router)
    void push('/definitely-not-a-page')
    expect(useViewSwing().swingDirection.value).toBe(1)
    expect(activeView.value).toBe('/definitely-not-a-page')
  })

  it('snaps under reduced motion, without ever marking the stage as swinging', () => {
    motion.reduced = true
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    void push('/tools')

    const { swing, swinging } = useViewSwing()
    expect(swinging.value).toBe(false)
    expect(swing.value).toBe(1)
    expect(frames).toHaveLength(0)
  })

  it('settles on a timer if the frames never come — a hidden tab must not stay fixed', () => {
    vi.useFakeTimers()
    try {
      const { router, push } = fakeRouter('/')
      installViewSwing(router)
      void push('/tools')
      const { swing, swinging } = useViewSwing()
      expect(swinging.value).toBe(true)

      // No `advance()`: requestAnimationFrame is throttled to nothing, as in a
      // background tab. The deadline alone has to bring the stage back.
      vi.advanceTimersByTime(SWING_MS + 250)
      expect(swinging.value).toBe(false)
      expect(swing.value).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('scrolls to the hash once the swing has settled and the stage has unfixed', async () => {
    const { router, push } = fakeRouter('/tools')
    installViewSwing(router)
    void push({ path: '/', hash: '#projects' })

    expect(scrolled).not.toHaveBeenCalled()
    advance(0)
    advance(SWING_MS)
    // Not yet: the DOM still has the fixed stage until Vue flushes.
    expect(scrolled).not.toHaveBeenCalled()
    await nextTick()
    expect(scrolled).toHaveBeenCalledWith('projects')
  })
})

describe('goTo', () => {
  it('scrolls to a section that is on the page showing', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    expect(goTo('projects')).toBe(true)
    expect(scrolled).toHaveBeenCalledWith('projects')
    expect(push).not.toHaveBeenCalled()
  })

  it('routes home with a hash for a section on another view', () => {
    const { router, push } = fakeRouter('/tools')
    installViewSwing(router)
    expect(goTo('projects')).toBe(true)
    expect(push).toHaveBeenCalledWith({ path: '/', hash: '#projects' })
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('pushes a view, or a tool inside it', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    expect(goTo('tools')).toBe(true)
    expect(push).toHaveBeenLastCalledWith('/tools')
    expect(goTo('tools/image')).toBe(true)
    expect(push).toHaveBeenLastCalledWith('/tools/image')
  })

  it('takes the bare path home — the top of the page when already there', () => {
    const away = fakeRouter('/tools')
    installViewSwing(away.router)
    expect(goTo('')).toBe(true)
    expect(away.push).toHaveBeenCalledWith('/')

    const home = fakeRouter('/')
    installViewSwing(home.router)
    expect(goTo('~')).toBe(true)
    expect(scrolled).toHaveBeenCalledWith('about')
    expect(home.push).not.toHaveBeenCalled()
  })

  it('joins a room by code', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    expect(goTo('radio/ab3de')).toBe(true)
    expect(push).toHaveBeenCalledWith('/radio/AB3DE')
  })

  it('returns false for an unknown target and goes nowhere', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    expect(goTo('nope')).toBe(false)
    expect(goTo('tools/nope')).toBe(false)
    expect(goTo('watch/abcd')).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(scrolled).not.toHaveBeenCalled()
  })
})

describe('currentPath', () => {
  it('is the section on the home page and the route path elsewhere', () => {
    const { router, push } = fakeRouter('/')
    installViewSwing(router)
    expect(currentPath()).toBe('projects')

    void push('/tools/image')
    expect(currentPath()).toBe('tools/image')
  })
})
