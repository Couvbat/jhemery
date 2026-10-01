import { beforeEach, describe, expect, it, vi } from 'vitest'

const presence = vi.hoisted(() => ({
  whenPresent: vi.fn<(signal?: AbortSignal) => Promise<number | null>>(),
  sendWave: vi.fn<(signal?: AbortSignal) => Promise<'sent' | 'alone' | 'limited' | 'unavailable' | 'off'>>(),
}))
vi.mock('@/composables/usePresence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/usePresence')>()),
  ...presence,
}))

import { WHO_ROWS } from '../commands/system'
import { isLinkable, resolve, writesOf } from '../registry'
import { runCommand } from './context'

const who = resolve('who')!
const wall = resolve('wall')!

beforeEach(() => {
  presence.whenPresent.mockReset()
  presence.sendWave.mockReset()
})

describe('who', () => {
  const rows = (text: string) => text.split('\n').filter((l) => /^(you|somebody)\s+pts\/\d+$/.test(l))

  it('is you alone, when you are', async () => {
    presence.whenPresent.mockResolvedValue(1)
    const { text } = await runCommand(who)
    expect(rows(text)).toEqual(['you       pts/0'])
    expect(text).toContain('just you here')
    // A wave is heard by whoever is there when it is sent, never by someone arriving later.
    expect(text).toContain('when you send it')
  })

  it('draws one anonymous tty per other visitor, and nothing about any of them', async () => {
    presence.whenPresent.mockResolvedValue(4)
    const { text } = await runCommand(who)
    expect(rows(text)).toEqual(['you       pts/0', 'somebody  pts/1', 'somebody  pts/2', 'somebody  pts/3'])
    expect(text).toContain('4 here now')
  })

  // The cap is the field's: one shape per visitor, twelve at most.
  it('stops at twelve others, and the line after still adds up to the count', async () => {
    presence.whenPresent.mockResolvedValue(40)
    const { text } = await runCommand(who)
    const others = rows(text).filter((row) => row.startsWith('somebody'))
    expect(others).toHaveLength(WHO_ROWS)
    const more = Number(/… and (\d+) more/.exec(text)?.[1])
    expect(1 + others.length + more).toBe(40)
  })

  it('says so when there is no count to be had', async () => {
    presence.whenPresent.mockResolvedValue(null)
    const { lines } = await runCommand(who)
    expect(lines[0]!.text).toMatch(/^who: presence is unavailable/)
  })

  it('reads in French too', async () => {
    presence.whenPresent.mockResolvedValue(20)
    const { text } = await runCommand(who, [], { locale: 'fr' })
    expect(text).toContain('… et 7 de plus')
    expect(text).toContain('20 personnes ici')
  })

  it('only reads, and a link may run it', () => {
    expect(writesOf(who, [])).toBe('none')
    expect(isLinkable(who)).toBe(true)
    expect(who.group).toBe('live')
  })
})

describe('wall', () => {
  it.each([
    ['sent', /^waved\./, 'success'],
    ['alone', /nobody else is here/, 'muted'],
    ['limited', /enough waving/, 'warning'],
    ['off', /broadcasts are switched off here/, 'muted'],
    ['unavailable', /could not be sent/, 'error'],
  ] as const)('says what became of it: %s', async (result, text, tone) => {
    presence.sendWave.mockResolvedValue(result)
    const { lines } = await runCommand(wall)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toMatch(text)
    expect(lines[0]!.tone).toBe(tone)
  })

  // A real `wall` broadcasts its arguments; this one carries no text at all.
  it('carries no message, and says so when given one', async () => {
    presence.sendWave.mockResolvedValue('sent')
    const { lines } = await runCommand(wall, ['hello', 'everyone'])
    expect(lines[0]!.text).toBe('messages are not carried — only the wave')
    expect(presence.sendWave).toHaveBeenCalledTimes(1)
    expect(presence.sendWave.mock.calls[0]).toHaveLength(1)
  })

  it('writes to the server, so a link may never run it', () => {
    expect(writesOf(wall, [])).toBe('server')
    expect(isLinkable(wall)).toBe(false)
    expect(wall.group).toBe('live')
  })
})
