import { describe, expect, it } from 'vitest'
import { openPager, PAGE_ROWS, page, pagerKey, pagerView } from '../pager'
import type { OutputLine } from '../types'
import { recordingContext } from './context'

const rows = (n: number): OutputLine[] => Array.from({ length: n }, (_, i) => ({ text: `row ${i + 1}` }))

describe('pagerKey', () => {
  it('moves a line, a page and to either end, never past them', () => {
    const state = openPager(rows(50))
    pagerKey(state, 'j')
    expect(state.top).toBe(1)
    pagerKey(state, 'k')
    pagerKey(state, 'k')
    expect(state.top).toBe(0)
    pagerKey(state, ' ')
    expect(state.top).toBe(PAGE_ROWS)
    pagerKey(state, 'G')
    expect(state.top).toBe(50 - PAGE_ROWS)
    pagerKey(state, ' ')
    expect(state.top).toBe(50 - PAGE_ROWS)
    pagerKey(state, 'b')
    expect(state.top).toBe(50 - 2 * PAGE_ROWS)
    pagerKey(state, 'g')
    expect(state.top).toBe(0)
  })

  it('searches with /, then n and N between the matches', () => {
    const state = openPager([...rows(30), { text: 'NEEDLE one' }, ...rows(10), { text: 'needle two' }, ...rows(30)])
    for (const key of ['/', 'n', 'e', 'e', 'd', 'l', 'e', 'Enter']) pagerKey(state, key)
    expect(state.top).toBe(30)
    pagerKey(state, 'n')
    expect(state.top).toBe(41)
    pagerKey(state, 'N')
    expect(state.top).toBe(30)
  })

  it('says so when nothing matches, and Escape abandons a search', () => {
    const state = openPager(rows(40))
    for (const key of ['/', 'z', 'z', 'Enter']) pagerKey(state, key)
    expect(state.message).toBe('Pattern not found')
    expect(pagerView(state, 'ls(1)').at(-1)!.text).toBe('Pattern not found')
    pagerKey(state, '/')
    pagerKey(state, 'x')
    expect(pagerView(state, 'ls(1)').at(-1)!.text).toBe('/x')
    pagerKey(state, 'Escape')
    expect(state.typing).toBeNull()
  })

  it('quits on q', () => {
    expect(pagerKey(openPager(rows(40)), 'q')).toBe('quit')
  })
})

describe('page', () => {
  it('shows a page and a status line, and leaves nothing behind on q', async () => {
    const recorded = recordingContext('man', [])
    const done = page(recorded.ctx, rows(40), 'ls(1)')
    expect(recorded.printed).toHaveLength(PAGE_ROWS + 1)
    expect(recorded.printed.at(-1)!.text).toContain('press q to quit')
    recorded.press(' ')
    expect(recorded.printed[0]!.text).toBe(`row ${PAGE_ROWS + 1}`)
    recorded.press('q')
    await done
    expect(recorded.printed).toEqual([])
  })

  it('just returns a page that fits, or any page when nobody is at the keyboard', async () => {
    expect(await page(recordingContext('man', []).ctx, rows(5), 'x')).toHaveLength(5)
    expect(await page(recordingContext('man', [], { interactive: false }).ctx, rows(40), 'x')).toHaveLength(40)
  })

  it('stops on Ctrl+C, clearing its screen', async () => {
    const controller = new AbortController()
    const recorded = recordingContext('man', [], { signal: controller.signal })
    const done = page(recorded.ctx, rows(40), 'x')
    controller.abort()
    await expect(done).rejects.toMatchObject({ name: 'AbortError' })
    expect(recorded.printed).toEqual([])
  })
})
