/**
 * The lab map's wires, from the cards' rectangles: pure, so the geometry is a test and
 * the component only measures. The wires are decoration (the SVG is `aria-hidden`); each
 * card's own text says what it reaches.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * A cubic from one card to another, leaving and arriving on the sides that face each
 * other. Side by side (the wide layout) it runs horizontally; stacked (one column below
 * `md`, or a card above another in the same tier) it runs vertically. The same DOM
 * either way, so this is the only thing the layout changes.
 */
export function wirePath(from: Box, to: Box): string {
  const fromRight = from.left + from.width
  const toRight = to.left + to.width
  const sideBySide = fromRight <= to.left || toRight <= from.left

  if (sideBySide) {
    const forward = fromRight <= to.left
    const x1 = forward ? fromRight : from.left
    const x2 = forward ? to.left : toRight
    const y1 = from.top + from.height / 2
    const y2 = to.top + to.height / 2
    const mid = (x1 + x2) / 2
    return `M${r1(x1)} ${r1(y1)} C${r1(mid)} ${r1(y1)} ${r1(mid)} ${r1(y2)} ${r1(x2)} ${r1(y2)}`
  }

  const down = from.top + from.height <= to.top + to.height / 2
  const x1 = from.left + from.width / 2
  const x2 = to.left + to.width / 2
  const y1 = down ? from.top + from.height : from.top
  const y2 = down ? to.top : to.top + to.height
  const mid = (y1 + y2) / 2
  return `M${r1(x1)} ${r1(y1)} C${r1(x1)} ${r1(mid)} ${r1(x2)} ${r1(mid)} ${r1(x2)} ${r1(y2)}`
}

/** A rectangle relative to a container's, which is where the SVG's origin is. */
export function relativeTo(rect: DOMRectReadOnly, container: DOMRectReadOnly): Box {
  return { left: rect.left - container.left, top: rect.top - container.top, width: rect.width, height: rect.height }
}
