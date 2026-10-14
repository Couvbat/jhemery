import { OUTER_ATTR, SRC_ATTR, type XrayMap } from './xray-stamp'

export { OUTER_ATTR, SRC_ATTR, type XrayMap }

/**
 * X-ray mode's page side (roadmap §I, *X-ray mode*): which elements get outlined, what
 * each tag says and where it goes. `components/XrayLayer.vue` draws what this works out,
 * from the attributes the build stamps (`lib/xray-stamp.ts`).
 */

/** The three.js canvas, whose tag also counts the shapes. */
export const CANVAS_FILE = 'frontend/src/components/ThreeBackground.vue'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Viewport {
  w: number
  h: number
}

export interface Target {
  /** Outermost first: `[HashTool.vue, ToolFrame.vue]`, or the one file. */
  files: string[]
  rect: Rect
  /** Fixed and covering the screen, as the canvas is: tagged in a corner, not outlined. */
  backdrop: boolean
}

export interface Tag {
  /** The files, joined: one tag per distinct set, however many instances are on screen. */
  key: string
  files: string[]
  /** How many elements on screen it names: the windows each have a `WindowDots.vue`. */
  count: number
  /** The first of them, in document order. */
  anchor: Rect
  backdrop: boolean
}

/** Smaller than this is a visually hidden node (`sr-only`), not something to outline. */
const MIN_SIZE = 4
/** Between two stacked tags; four of them keep a backdrop's tag off the screen's corner. */
export const GAP = 2
/** Stop looking for a free place after this many moves, and accept an overlap. */
const MAX_MOVES = 24

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The files an element names, outermost first. */
export function filesOf(el: Element): string[] {
  return [el.getAttribute(OUTER_ATTR), el.getAttribute(SRC_ATTR)].filter((file): file is string => !!file)
}

/**
 * Opacity and visibility count, so a toast that has faded out or a tooltip at rest isn't
 * outlined. `checkVisibility` is recent (2024 everywhere), so without it everything with a
 * size passes.
 */
function shown(el: Element): boolean {
  return typeof el.checkVisibility !== 'function' || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
}

function covers(box: Rect, viewport: Viewport): boolean {
  return box.x <= 0 && box.y <= 0 && box.x + box.w >= viewport.w && box.y + box.h >= viewport.h
}

function rectOf(el: Element): Rect {
  const box = el.getBoundingClientRect()
  return { x: box.left, y: box.top, w: box.width, h: box.height }
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y }
}

/** `''` is what a document with no layout (jsdom) computes, and it cuts nothing either. */
function clips(el: Element): boolean {
  const { overflowX, overflowY } = getComputedStyle(el)
  return ![overflowX, overflowY].every((value) => value === '' || value === 'visible')
}

/**
 * The part of an element its ancestors let through. A card's clamped description holds
 * `<code>` runs past its last line, laid out but cut off, and outlining those would draw
 * empty boxes. A fixed element escapes its ancestors' overflow, so it is never cut.
 * `cache` keeps each ancestor's answer for one pass, since siblings share them.
 */
function visiblePart(el: Element, cache: Map<Element, Rect | null>): Rect {
  let rect = rectOf(el)
  if (getComputedStyle(el).position === 'fixed') return rect
  for (let parent = el.parentElement; parent && parent !== el.ownerDocument.body; parent = parent.parentElement) {
    let bounds = cache.get(parent)
    if (bounds === undefined) {
      bounds = clips(parent) ? rectOf(parent) : null
      cache.set(parent, bounds)
    }
    if (bounds) rect = intersect(rect, bounds)
  }
  return rect
}

/**
 * Every stamped element on screen, in document order: big enough to be seen once its
 * ancestors' overflow has cut it, not in `skip` (the layer itself), and not in an `inert`
 * subtree (the page turning away during a swing). A component on another part of the
 * page isn't listed until it scrolls in.
 */
export function collectTargets(root: ParentNode, viewport: Viewport, skip?: Element | null): Target[] {
  const targets: Target[] = []
  const cache = new Map<Element, Rect | null>()
  for (const el of root.querySelectorAll(`[${SRC_ATTR}], [${OUTER_ATTR}]`)) {
    if (skip?.contains(el) || el.closest('[inert]')) continue
    const rect = visiblePart(el, cache)
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) continue
    if (rect.y + rect.h <= 0 || rect.x + rect.w <= 0 || rect.y >= viewport.h || rect.x >= viewport.w) continue
    if (!shown(el)) continue
    targets.push({
      files: filesOf(el),
      rect,
      backdrop: covers(rect, viewport) && getComputedStyle(el).position === 'fixed',
    })
  }
  return targets
}

/** Every target outlined, but one tag per set of files, at its first instance. */
export function groupTargets(targets: Target[]): { boxes: Rect[]; tags: Tag[] } {
  const boxes: Rect[] = []
  const tags = new Map<string, Tag>()
  for (const target of targets) {
    if (!target.backdrop) boxes.push(target.rect)
    const key = target.files.join(' ')
    const seen = tags.get(key)
    if (seen) seen.count++
    else tags.set(key, { key, files: target.files, count: 1, anchor: target.rect, backdrop: target.backdrop })
  }
  return { boxes, tags: [...tags.values()] }
}

export interface TagPart {
  file: string
  /** The files its words come from, `messages.ts` among them when it reads the chrome strings. */
  words: string[]
}

export function tagParts(files: string[], map: XrayMap): TagPart[] {
  return files.map((file) => ({ file, words: map[file] ?? [] }))
}

/**
 * The tag as it reads on screen, which is also what its width is measured from: the layer
 * renders exactly these runs, and its type is monospaced, so the width is this many `ch`.
 * `HashTool.vue ← messages.ts › ToolFrame.vue ×2`.
 */
export function tagText(parts: TagPart[], suffix = ''): string {
  const each = parts.map((part) =>
    part.words.length ? `${baseName(part.file)} ← ${part.words.map(baseName).join(' ')}` : baseName(part.file),
  )
  return `${each.join(' › ')}${suffix}`
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/**
 * Where each tag goes: the top-left corner of the first box it names, kept on screen, then
 * moved down past any tag already there. Tags come in document order, which puts a page
 * before its sections and a section before what it holds, so where several boxes start at
 * the same corner the stack reads like a path. A backdrop's tag starts at the bottom-left
 * and moves up instead, above whatever is `reserved` there (the layer's own status chip).
 */
export function placeTags(
  tags: Array<{ anchor: Rect; backdrop: boolean; size: { w: number; h: number } }>,
  viewport: Viewport,
  reserved: Rect[] = [],
): Array<{ x: number; y: number }> {
  const taken = [...reserved]
  return tags.map(({ anchor, backdrop, size }) => {
    const x = backdrop ? GAP * 4 : clamp(anchor.x, 0, Math.max(0, viewport.w - size.w))
    let y = backdrop ? viewport.h - size.h - GAP * 4 : clamp(anchor.y, 0, Math.max(0, viewport.h - size.h))
    for (let moves = 0; moves < MAX_MOVES; moves++) {
      const hit = taken.find((rect) => overlaps(rect, { x, y, ...size }))
      if (!hit) break
      y = backdrop ? hit.y - size.h - GAP : hit.y + hit.h + GAP
    }
    taken.push({ x, y, ...size })
    return { x, y }
  })
}
