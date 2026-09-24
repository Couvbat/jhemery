import { computed, ref, watch, type WatchStopHandle } from 'vue'
import { roomPlaying } from '@/rooms/useRoom'
import { terminalCapturing } from './useTerminalShell'

/**
 * The screensaver: after a few idle minutes with the tab in view, the page fades and
 * the wireframe field has the screen to itself; any key or pointer movement brings
 * the page back.
 *
 * `ThreeBackground` starts it and stops it, which is the whole of its reduced-motion
 * handling: that component never mounts under reduced motion, so neither does this —
 * there would be nothing behind the page to show.
 *
 * It never starts while a game holds the keyboard or a room is playing. Both would be
 * worse than no screensaver: a paused tetris board is still a board being played, and
 * a watch party is the one time someone looks at the page without touching it.
 */

export const SCREENSAVER_AFTER_MS = 3 * 60_000

const active = ref(false)

/** Input that counts as someone being here. `pointermove` is the one that matters. */
const ACTIVITY = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Wires the idle timer to the window. Returns the teardown. A second call replaces the
 * first — there is only one background, and only one screensaver.
 */
let teardown: (() => void) | null = null

export function startScreensaver(after = SCREENSAVER_AFTER_MS): () => void {
  teardown?.()

  let timer: ReturnType<typeof setTimeout> | undefined
  /** A pointer press that woke the page must not also click whatever was under it. */
  let swallowClick = false
  const blocked = () => terminalCapturing.value || roomPlaying.value

  const arm = () => {
    clearTimeout(timer)
    if (document.visibilityState !== 'visible') return
    timer = setTimeout(() => {
      // Checked when the timer fires, not when it was set: a game started in the
      // meantime keeps the page up, and the check simply runs again later.
      if (blocked()) arm()
      else active.value = true
    }, after)
  }

  const onActivity = (event: Event) => {
    if (active.value) {
      active.value = false
      // The key or press that wakes the page is spent on waking it — the same as a
      // real screensaver, and what stops a backtick from also opening the terminal.
      if (event.type === 'keydown' || event.type === 'pointerdown') {
        event.preventDefault()
        event.stopPropagation()
        swallowClick = event.type === 'pointerdown'
      }
    }
    arm()
  }

  const onClick = (event: Event) => {
    if (!swallowClick) return
    swallowClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') arm()
    else clearTimeout(timer)
  }

  for (const type of ACTIVITY) {
    window.addEventListener(type, onActivity, { capture: true, passive: type !== 'keydown' && type !== 'pointerdown' })
  }
  window.addEventListener('click', onClick, { capture: true })
  document.addEventListener('visibilitychange', onVisibility)
  // Something that starts holding the page mid-screensaver brings it back at once.
  const stopWatch: WatchStopHandle = watch([terminalCapturing, roomPlaying], () => {
    if (blocked()) active.value = false
    arm()
  })
  arm()

  teardown = () => {
    clearTimeout(timer)
    stopWatch()
    for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true })
    window.removeEventListener('click', onClick, { capture: true })
    document.removeEventListener('visibilitychange', onVisibility)
    active.value = false
    teardown = null
  }
  return teardown
}

export function useScreensaver() {
  return { screensaver: computed(() => active.value) }
}

// The page's own chrome fades through a data attribute on <html> (see main.css), so no
// component has to know the screensaver exists except the one that owns it.
if (typeof document !== 'undefined') {
  watch(active, (on) => {
    if (on) document.documentElement.dataset.screensaver = ''
    else delete document.documentElement.dataset.screensaver
  })
}
