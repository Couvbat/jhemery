import { computed, nextTick, ref } from 'vue'
import type { RouteLocationRaw, Router } from 'vue-router'
import type { SectionMeta, ViewMeta } from '@/content'
import { findSection, findView, sections, viewFor, viewIndex, views } from '@/content'
import { findTool, type ToolMeta } from '@/tools/registry'
import { normaliseCode } from '@/rooms/sync'
import { currentSection, scrollToSection } from './useActiveSection'
import { prefersReducedMotion } from './useCrt'

/**
 * The prism swing between views — superpowers/specs/2026-09-22-tools-and-views-design.md §3.
 *
 * One clock, three readers. The router starts a swing; `App.vue` binds `swing`,
 * `swingDirection` and `leaveScroll` as CSS custom properties on the stage that turns
 * the two pages; `ThreeBackground` reads the same `swing` to yaw the wireframe field
 * and dolly the camera. Because the easing is applied *here*, once, the page and the
 * background can never disagree on the curve. Same flag-and-watch shape as
 * `useSceneControl`: the router sets, the components only read.
 *
 * This module also owns `goTo()` — the one function the navbar, the palette and the
 * terminal's `navigate` all call — because it is the only place that knows both the
 * router and whether a section is on the page currently showing.
 */

/** How long the prism takes to turn one face. `App.vue`'s `<Transition>` uses the same number. */
export const SWING_MS = 650

/** Which face is showing: a view id, or the raw path for anything the router sent to
 *  the 404. Set from the router; read by `pwd`, the navbar, the palette and the
 *  background's palette. */
export const activeView = ref<string>('home')

/** Eased progress of the current swing, 0 → 1. Rests at 1. */
const swing = ref(1)
const direction = ref<1 | -1>(1)
/** True from the swing's first frame to its last — the stage is a fixed, clipped
 *  perspective box exactly while this is true. */
const swinging = ref(false)
/** `window.scrollY` at the instant the swing began, so the leaving page can keep
 *  showing what the visitor was looking at while the window scrolls to the top of
 *  the new one. */
const leaveScroll = ref(0)

/** Only the three members this module touches, so a test can hand it a stub. */
export type SwingRouter = Pick<Router, 'afterEach' | 'currentRoute' | 'push'>

let router: SwingRouter | null = null
let frame: number | null = null

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function cancelFrame() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
}

/** Turns the prism one face in `dir`. Under reduced motion nothing moves: `swing`
 *  stays at rest, `swinging` never becomes true, and the pages simply swap. */
export function startSwing(dir: 1 | -1): void {
  direction.value = dir
  cancelFrame()
  if (prefersReducedMotion()) {
    swing.value = 1
    swinging.value = false
    return
  }

  leaveScroll.value = window.scrollY
  swing.value = 0
  swinging.value = true

  // Timed from the first frame's own timestamp rather than `performance.now()` at
  // the call, so a busy main thread between the two cannot skip the opening frames.
  let started: number | null = null
  const tick = (now: number) => {
    started ??= now
    const t = Math.min(1, (now - started) / SWING_MS)
    swing.value = easeInOut(t)
    if (t < 1) {
      frame = requestAnimationFrame(tick)
      return
    }
    frame = null
    settle()
  }
  frame = requestAnimationFrame(tick)
}

/** The stage goes back into normal flow, and a hash the route carried is honoured now:
 *  the router's own `scrollBehavior` fired while the stage was fixed and the document
 *  had no height, so it clamped to zero. After `nextTick`, not before — until Vue has
 *  flushed `swinging`, the stage is still a fixed `overflow: hidden` box, and
 *  `scrollIntoView` would scroll *it* (a scroll offset that vanishes with the class)
 *  instead of the window. */
function settle() {
  swinging.value = false
  const hash = router?.currentRoute.value.hash
  if (!hash) return
  void nextTick().then(() => scrollToSection(hash.slice(1)))
}

function viewIdFor(path: string): string {
  return viewFor(path)?.id ?? path
}

/** Hooks the router. Called once, from `App.vue`. */
export function installViewSwing(instance: SwingRouter): void {
  router = instance
  // A fresh router means a fresh clock — nothing can be mid-turn.
  cancelFrame()
  swing.value = 1
  swinging.value = false
  activeView.value = viewIdFor(instance.currentRoute.value.path)

  instance.afterEach((to, from, failure) => {
    if (failure) return
    activeView.value = viewIdFor(to.path)

    // The very first navigation comes from START_LOCATION, which matched nothing —
    // there is no page to swing away from.
    if (!from.matched.length) return

    // Same face: a hash change on the home page, or a tool opening on the tools page.
    const a = viewIndex(from.path)
    const b = viewIndex(to.path)
    if (a === b) return

    startSwing(b > a ? 1 : -1)
  })
}

export type ResolvedPath =
  | { kind: 'section'; section: SectionMeta }
  | { kind: 'view'; view: ViewMeta; tool?: ToolMeta; code?: string }

/**
 * What a `cd`-style path names, or `undefined` for "No such file or directory".
 * Accepts everything `cd` does — `about`, `tools`, `/tools`, `~/tools/`,
 * `tools/image`, and the bare `~`/`/` for home. A view's sub-path is checked against
 * that view's own registry, so a typo stays an error in the terminal rather than
 * becoming a page that says the same thing.
 */
export function resolvePath(target: string): ResolvedPath | undefined {
  const segments = target.trim().replace(/^~/, '').split('/').filter(Boolean)
  if (!segments.length) return { kind: 'view', view: views[0]! }

  const [head, ...rest] = segments as [string, ...string[]]
  const section = findSection(head)
  if (section) return rest.length ? undefined : { kind: 'section', section }

  const view = findView(head)
  if (!view) return undefined
  if (!rest.length) return { kind: 'view', view }
  if (rest.length > 1) return undefined

  if (view.id === 'tools') {
    const tool = findTool(rest[0]!)
    return tool ? { kind: 'view', view, tool } : undefined
  }
  // `cd watch/AB3DE` joins a room, the way `cd tools/json` opens a tool.
  if (view.id === 'watch' || view.id === 'radio') {
    const code = normaliseCode(rest[0]!)
    return code ? { kind: 'view', view, code } : undefined
  }
  return undefined
}

/** What `pwd` prints after `/home/<handle>/`: the section on the home page, the
 *  route path everywhere else (`tools`, `tools/image`). */
export function currentPath(): string {
  if (activeView.value === 'home') return currentSection()
  const path = router?.currentRoute.value.path ?? `/${activeView.value}`
  return path.replace(/^\/+/, '')
}

function push(to: RouteLocationRaw): boolean {
  if (!router) return false
  void router.push(to)
  return true
}

/**
 * Goes wherever `target` names. A section on the page currently showing scrolls; a
 * section on another view routes home with a hash, and `settle()` scrolls to it once
 * the swing is over. Returns false for an unknown target, so callers can say so.
 */
export function goTo(target: string): boolean {
  const resolved = resolvePath(target)
  if (!resolved) return false

  if (resolved.kind === 'section') {
    if (activeView.value === 'home') return scrollToSection(resolved.section.id)
    return push({ path: '/', hash: `#${resolved.section.id}` })
  }

  const { view, tool, code } = resolved
  if (view.id === 'home') {
    if (activeView.value === 'home') return scrollToSection(sections[0]!.id)
    return push('/')
  }
  const child = tool?.id ?? code
  return push(child ? `${view.path}/${child}` : view.path)
}

export function useViewSwing() {
  return {
    activeView: computed(() => activeView.value),
    swing: computed(() => swing.value),
    swingDirection: computed(() => direction.value),
    swinging: computed(() => swinging.value),
    leaveScroll: computed(() => leaveScroll.value),
  }
}
