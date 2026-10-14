import { afterEach, describe, expect, it } from 'vitest'
import {
  collectTargets,
  GAP,
  groupTargets,
  OUTER_ATTR,
  placeTags,
  SRC_ATTR,
  tagParts,
  tagText,
  type Rect,
  type Target,
} from '../xray'

/**
 * X-ray mode's page side: what gets outlined, what a tag says and where it goes. jsdom
 * lays nothing out, so each element is handed the rect a browser would give it; that a
 * real page is tagged is `e2e/xray.spec.ts`'s.
 */

const VIEWPORT = { w: 1000, h: 800 }
const HERO = 'frontend/src/components/sections/HeroSection.vue'
const HOME = 'frontend/src/views/HomeView.vue'

function element(attrs: Record<string, string>, rect: Rect, parent: Element = document.body, style = ''): HTMLElement {
  const el = document.createElement('div')
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  if (style) el.setAttribute('style', style)
  el.getBoundingClientRect = () => {
    const { x, y, w, h } = rect
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }
  }
  parent.append(el)
  return el
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('what gets outlined', () => {
  it('lists the stamped elements on screen in document order, outer file first', () => {
    const home = element({ [SRC_ATTR]: HOME }, { x: 0, y: -400, w: 1000, h: 3000 })
    element({ [SRC_ATTR]: HERO }, { x: 0, y: 0, w: 1000, h: 800 }, home)
    element({ [SRC_ATTR]: 'frontend/src/tools/ToolFrame.vue', [OUTER_ATTR]: 'frontend/src/tools/hash/HashTool.vue' }, { x: 40, y: 100, w: 600, h: 300 }, home)
    element({ class: 'unstamped' }, { x: 0, y: 0, w: 50, h: 50 }, home)

    const targets = collectTargets(document, VIEWPORT)
    expect(targets.map((target) => target.files)).toEqual([
      [HOME],
      [HERO],
      ['frontend/src/tools/hash/HashTool.vue', 'frontend/src/tools/ToolFrame.vue'],
    ])
    // Taller than the screen, but in the page: outlined like anything else.
    expect(targets[0]!.backdrop).toBe(false)
  })

  it('leaves out what can’t be seen, the layer itself and a page turning away', () => {
    element({ [SRC_ATTR]: 'frontend/src/App.vue' }, { x: 0, y: 0, w: 1, h: 1 }) // sr-only
    element({ [SRC_ATTR]: 'frontend/src/components/SiteFooter.vue' }, { x: 0, y: 900, w: 1000, h: 200 }) // below the fold
    element({ [SRC_ATTR]: 'frontend/src/components/NavBar.vue' }, { x: 0, y: -60, w: 1000, h: 56 }) // scrolled past
    const layer = element({ [SRC_ATTR]: 'frontend/src/components/XrayLayer.vue' }, { x: 0, y: 0, w: 1000, h: 800 })
    const leaving = element({ inert: '' }, { x: 0, y: 0, w: 1000, h: 800 })
    element({ [SRC_ATTR]: HOME }, { x: 0, y: 0, w: 1000, h: 800 }, leaving)

    expect(collectTargets(document, VIEWPORT, layer)).toEqual([])
  })

  // A card's clamped description: `<code>` runs past its last line are laid out, and cut.
  it('outlines only what an ancestor’s overflow lets through', () => {
    const card = element({}, { x: 100, y: 100, w: 300, h: 60 }, document.body, 'overflow-x: hidden; overflow-y: hidden')
    const code = 'frontend/src/components/CodeText.vue'
    element({ [SRC_ATTR]: code }, { x: 120, y: 140, w: 80, h: 40 }, card)
    element({ [SRC_ATTR]: code }, { x: 120, y: 200, w: 80, h: 20 }, card)

    expect(collectTargets(document, VIEWPORT).map((target) => target.rect)).toEqual([{ x: 120, y: 140, w: 80, h: 20 }])
  })

  it('tags a fixed layer over the whole screen without outlining it', () => {
    element({ [SRC_ATTR]: 'frontend/src/components/ThreeBackground.vue' }, { x: 0, y: 0, w: 1000, h: 800 }, document.body, 'position: fixed')
    element({ [SRC_ATTR]: HERO }, { x: 0, y: 0, w: 1000, h: 800 })

    const targets = collectTargets(document, VIEWPORT)
    expect(targets.map((target) => target.backdrop)).toEqual([true, false])
    const { boxes, tags } = groupTargets(targets)
    expect(boxes).toHaveLength(1)
    expect(tags.map((tag) => tag.backdrop)).toEqual([true, false])
  })
})

describe('one tag per file', () => {
  const at = (x: number, y: number): Rect => ({ x, y, w: 40, h: 10 })
  const target = (files: string[], rect: Rect): Target => ({ files, rect, backdrop: false })

  it('outlines every instance and tags the first, with how many there are', () => {
    const dots = 'frontend/src/components/WindowDots.vue'
    const { boxes, tags } = groupTargets([target([HERO], at(0, 0)), target([dots], at(10, 20)), target([dots], at(10, 400))])
    expect(boxes).toHaveLength(3)
    expect(tags.map(({ files, count, anchor }) => ({ files, count, anchor }))).toEqual([
      { files: [HERO], count: 1, anchor: at(0, 0) },
      { files: [dots], count: 2, anchor: at(10, 20) },
    ])
  })

  it('reads as the layer draws it', () => {
    const parts = tagParts(['frontend/src/tools/hash/HashTool.vue', 'frontend/src/tools/ToolFrame.vue'], {
      'frontend/src/tools/hash/HashTool.vue': ['frontend/src/i18n/messages.ts'],
    })
    expect(tagText(parts, ' ×2')).toBe('HashTool.vue ← messages.ts › ToolFrame.vue ×2')
    expect(tagText(tagParts([HERO], { [HERO]: ['frontend/src/content/profile.ts', 'frontend/src/content/skills.ts'] }))).toBe(
      'HeroSection.vue ← profile.ts skills.ts',
    )
  })
})

describe('where a tag goes', () => {
  const size = { w: 120, h: 18 }

  // A page, its first section and that section's window all start at one corner: the
  // tags stack in that order instead of covering each other.
  it('stacks tags that share a corner, outermost on top', () => {
    const corner = { x: 0, y: 56, w: 1000, h: 700 }
    const places = placeTags(
      [corner, corner, { x: 0, y: 60, w: 400, h: 300 }].map((anchor) => ({ anchor, backdrop: false, size })),
      VIEWPORT,
    )
    expect(places).toEqual([
      { x: 0, y: 56 },
      { x: 0, y: 56 + 18 + GAP },
      { x: 0, y: 56 + 2 * (18 + GAP) },
    ])
  })

  it('keeps a tag on screen when its box starts above it or runs off the edge', () => {
    const places = placeTags(
      [
        { anchor: { x: 0, y: -900, w: 1000, h: 3000 }, backdrop: false, size },
        { anchor: { x: 950, y: 300, w: 200, h: 100 }, backdrop: false, size },
      ],
      VIEWPORT,
    )
    expect(places).toEqual([
      { x: 0, y: 0 },
      { x: 1000 - 120, y: 300 },
    ])
  })

  it('puts a backdrop’s tag in the bottom corner, above what is reserved there', () => {
    const chip = { x: 24, y: 800 - 24 - 30, w: 200, h: 30 }
    const [place] = placeTags([{ anchor: { x: 0, y: 0, w: 1000, h: 800 }, backdrop: true, size }], VIEWPORT, [chip])
    expect(place!.y + size.h).toBeLessThanOrEqual(chip.y)
    expect(place!.x).toBeLessThan(chip.x + chip.w)
  })
})
