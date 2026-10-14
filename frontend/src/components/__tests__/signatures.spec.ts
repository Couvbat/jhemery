import { describe, expect, it } from 'vitest'
import type { GuestbookEntry } from '@/lib/api'
import {
  MAX_SIGNATURE_SHAPES,
  newestSignatures,
  seededRandom,
  shapeLayout,
  signatureDay,
  signatureLabel,
} from '../signatures'

/** The field's six kinds (`ThreeBackground`'s `KINDS`). */
const KINDS = 6

// Midday UTC, so the day is the same in every time zone a test machine is likely to be in:
// the label reads the visitor's own calendar.
function entry(n: number, overrides: Partial<GuestbookEntry> = {}): GuestbookEntry {
  const day = String(n).padStart(2, '0')
  return {
    id: `entry-${n}`,
    name: `visitor ${n}`,
    message: `message ${n}`,
    date: `2026-08-${day}T12:00:00.000Z`,
    ...overrides,
  }
}

describe('newestSignatures', () => {
  it('keeps the newest twelve, newest first', () => {
    const page = Array.from({ length: 25 }, (_, i) => entry(25 - i))
    const kept = newestSignatures(page)
    expect(MAX_SIGNATURE_SHAPES).toBe(12)
    expect(kept.map((e) => e.id)).toEqual(Array.from({ length: 12 }, (_, i) => `entry-${25 - i}`))
  })

  it('goes by the dates, not by the order the page came in', () => {
    const kept = newestSignatures([entry(3), entry(9), entry(1), entry(7)], 2)
    expect(kept.map((e) => e.id)).toEqual(['entry-9', 'entry-7'])
  })

  it('draws an id once, and puts a date it cannot read last', () => {
    const kept = newestSignatures([entry(1, { date: 'not a date' }), entry(2), entry(2), entry(3)])
    expect(kept.map((e) => e.id)).toEqual(['entry-3', 'entry-2', 'entry-1'])
  })

  it('is empty for an empty or closed guestbook', () => {
    expect(newestSignatures([])).toEqual([])
  })
})

describe('seededRandom', () => {
  it('gives the same numbers for the same id, and others for another', () => {
    const draw = (seed: string) => {
      const random = seededRandom(seed)
      return Array.from({ length: 8 }, () => random())
    }
    expect(draw('entry-1')).toEqual(draw('entry-1'))
    expect(draw('entry-1')).not.toEqual(draw('entry-2'))
    for (const value of draw('entry-1')) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('spreads uuids over every kind', () => {
    const counts = Array.from({ length: KINDS }, () => 0)
    for (let i = 0; i < 6000; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-7425-40de-944b-e07fc1f90ae7`
      counts[shapeLayout(seededRandom(id), KINDS).kind]! += 1
    }
    // A thousand each if even; a broken hash piles them into one or two.
    for (const count of counts) expect(count).toBeGreaterThan(850)
  })
})

describe('shapeLayout', () => {
  it('is the same shape in the same place for the same entry, on every visit', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(shapeLayout(seededRandom(id), KINDS)).toEqual(shapeLayout(seededRandom(id), KINDS))
    // Pinned, so a change to the hash or to the order of the draws, which would move every
    // signature on the site, has to be made on purpose.
    const layout = shapeLayout(seededRandom(id), KINDS)
    expect(layout.kind).toBe(5)
    expect(layout.place.x).toBeCloseTo(-0.282229, 5)
    expect(layout.place.y).toBeCloseTo(-0.454327, 5)
    expect(layout.place.z).toBeCloseTo(0.353813, 5)
  })

  it('stays inside the distribution every other shape is drawn from', () => {
    for (let i = 0; i < 500; i++) {
      const { kind, baseOpacity, place, rotation, speed } = shapeLayout(seededRandom(`entry-${i}`), KINDS)
      expect(Number.isInteger(kind) && kind >= 0 && kind < KINDS).toBe(true)
      expect(baseOpacity).toBeGreaterThanOrEqual(0.15)
      expect(baseOpacity).toBeLessThan(0.4)
      for (const axis of [place.x, place.y, place.z]) {
        expect(axis).toBeGreaterThanOrEqual(-0.5)
        expect(axis).toBeLessThan(0.5)
      }
      for (const angle of [rotation.x, rotation.y, rotation.z]) {
        expect(angle).toBeGreaterThanOrEqual(0)
        expect(angle).toBeLessThan(Math.PI)
      }
      expect(Math.abs(speed.x)).toBeLessThanOrEqual(0.003)
      expect(Math.abs(speed.y)).toBeLessThanOrEqual(0.003)
      expect(Math.abs(speed.z)).toBeLessThanOrEqual(0.002)
    }
  })

  it('never names a kind past the end of the list, even for a generator at its ceiling', () => {
    expect(shapeLayout(() => 0.9999999999, KINDS).kind).toBe(KINDS - 1)
  })
})

describe('signatureLabel', () => {
  const signed = entry(1, { name: 'ada' })

  it('names the kind, who signed and the day, in the visitor’s language', () => {
    expect(signatureLabel('icosahedron · 20 faces', signed, 'en')).toBe(
      'icosahedron · 20 faces · signed by ada, 1 August 2026',
    )
    expect(signatureLabel('icosahedron · 20 faces', signed, 'fr')).toBe(
      'icosahedron · 20 faces · signé par ada, le 1 août 2026',
    )
  })

  it('never shows the message', () => {
    // The whole entry, message and all, as the ticker hands it over.
    const whole: GuestbookEntry = { ...signed, message: 'hello from the body' }
    const label = signatureLabel('cube · 6 faces', whole, 'en')
    expect(label).not.toContain('hello from the body')
  })

  it('prints a name as it was typed, patterns and placeholders included', () => {
    for (const name of ['$&', '$1 $$', '{date}', '{name}']) {
      expect(signatureLabel('cube · 6 faces', { name, date: signed.date }, 'en')).toBe(
        `cube · 6 faces · signed by ${name}, 1 August 2026`,
      )
    }
  })

  it('shows a date it cannot read as it came, rather than "Invalid Date"', () => {
    expect(signatureDay('soon', 'en')).toBe('soon')
    expect(signatureLabel('cube · 6 faces', { name: 'ada', date: 'soon' }, 'en')).toBe(
      'cube · 6 faces · signed by ada, soon',
    )
  })
})
