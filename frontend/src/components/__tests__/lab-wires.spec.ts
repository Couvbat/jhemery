import { describe, expect, it } from 'vitest'
import { relativeTo, wirePath } from '../lab/wires'

const box = (left: number, top: number, width = 100, height = 40) => ({ left, top, width, height })

describe('the lab map’s wires', () => {
  it('runs between facing sides when the cards are side by side', () => {
    expect(wirePath(box(0, 0), box(200, 100))).toBe('M100 20 C150 20 150 120 200 120')
  })

  it('runs backwards from a card’s left side to one on its left', () => {
    expect(wirePath(box(300, 0), box(0, 0))).toBe('M300 20 C200 20 200 20 100 20')
  })

  it('runs vertically when the cards are stacked, as in one column', () => {
    expect(wirePath(box(0, 0), box(0, 100))).toBe('M50 40 C50 70 50 70 50 100')
    expect(wirePath(box(0, 100), box(0, 0))).toBe('M50 100 C50 70 50 70 50 40')
  })

  it('measures relative to the container, which is where the SVG starts', () => {
    const rect = { left: 120, top: 80, width: 50, height: 10 } as DOMRectReadOnly
    const container = { left: 20, top: 30 } as DOMRectReadOnly
    expect(relativeTo(rect, container)).toEqual({ left: 100, top: 50, width: 50, height: 10 })
  })
})
