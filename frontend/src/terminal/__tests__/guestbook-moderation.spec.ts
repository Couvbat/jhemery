import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  sign: vi.fn(),
  guestbookStatus: vi.fn(),
  heldGuestbook: vi.fn(),
  approveGuestbookEntry: vi.fn(),
  deleteGuestbookEntry: vi.fn(),
}))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, ...api } }
})
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => false,
}))

import { ApiError } from '@/lib/api'
import { unlocked } from '../achievements'
import { VERDICT_POLL_MS, VERDICT_WAIT_MS } from '../commands/live'
import { resolveFileLines } from '../commands/files'
import { cacheGuestbookEntries } from '../commands/guestbook-fs'
import { resolve } from '../registry'
import type { OutputLine } from '../types'
import { recordingContext } from './context'

/**
 * The guestbook with a local model reading it first
 * (`docs/superpowers/specs/2026-10-15-guestbook-moderation-design.md`): `sign` reads a
 * `201` from an API without moderation and a `202` from one with it, then asks after
 * the entry; a reply is text under the entry, never markup; the owner's `sudo`.
 */

const sign = resolve('sign')!
const sudo = resolve('sudo')!
const text = (lines: OutputLine[]) => lines.map((l) => l.text).join('\n')

function signing(args = ['great', 'site']) {
  const recorded = recordingContext('sign', args)
  recorded.ctx.prompt = async () => 'Ada'
  return recorded
}

async function sudoWith(args: string[], password = 'pw') {
  const recorded = recordingContext('sudo', args)
  recorded.ctx.prompt = async () => password
  const lines = (await sudo.run(recorded.ctx)) ?? []
  return [...recorded.printed, ...lines]
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  unlocked.value = new Set()
})

afterEach(() => vi.useRealTimers())

describe('sign, with a guestbook that reads entries first', () => {
  it('reads a 201 from an API without moderation as before', async () => {
    api.sign.mockResolvedValue({ id: '1', name: 'Ada', message: 'great site', date: '2026-10-15' })
    const recorded = signing()
    const out = [...recorded.printed, ...((await sign.run(recorded.ctx)) ?? [])]
    expect(api.sign).toHaveBeenCalledWith('Ada', 'great site', 'en')
    expect(text(out)).toContain('✓ signed. run `guestbook` to see it.')
    expect(api.guestbookStatus).not.toHaveBeenCalled()
    expect(unlocked.value.has('sign')).toBe(true)
  })

  it.each([
    ['published', '✓ it’s up — `guestbook` to see it.'],
    ['held', 'held for Jules to read; it will show if it’s fine.'],
  ])('says so when the entry is %s', async (status, words) => {
    vi.useFakeTimers()
    api.sign.mockResolvedValue({ id: 'abc', status: 'pending' })
    api.guestbookStatus.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValue({ status })
    const recorded = signing()
    const done = sign.run(recorded.ctx)
    await vi.advanceTimersByTimeAsync(2 * VERDICT_POLL_MS)
    const out = [...recorded.printed, ...((await done) ?? [])]

    expect(text(out)).toContain('✓ received. a local model reads every entry before it shows — usually a few seconds.')
    expect(text(out)).toContain(words)
    expect(api.guestbookStatus).toHaveBeenCalledWith('abc')
    expect(api.guestbookStatus).toHaveBeenCalledTimes(2)
    // The achievement is for an accepted entry, up or not.
    expect(unlocked.value.has('sign')).toBe(true)
  })

  it('says the model is asleep after 20 s with no verdict, a failed poll included', async () => {
    vi.useFakeTimers()
    api.sign.mockResolvedValue({ id: 'abc', status: 'pending' })
    api.guestbookStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'pending' })
    const recorded = signing()
    const done = sign.run(recorded.ctx)
    await vi.advanceTimersByTimeAsync(VERDICT_WAIT_MS)
    const out = [...recorded.printed, ...((await done) ?? [])]

    expect(api.guestbookStatus).toHaveBeenCalledTimes(VERDICT_WAIT_MS / VERDICT_POLL_MS)
    expect(text(out)).toContain('the model is asleep. it will show within 30 minutes either way.')
  })
})

describe('a reply under an entry', () => {
  it('reads as text, labelled as the model’s, with the page it drew from as a link', () => {
    cacheGuestbookEntries([
      {
        id: 'abcdef123',
        name: 'Ada',
        message: 'love the snake game',
        date: '2026-10-15T10:00:00Z',
        reply: { text: '<b>Thanks!</b> tetris is in there too.', by: 'model', see: 'why games' },
      },
    ])
    const lines = resolveFileLines('guestbook/ada-abcdef.txt', (v) => v.en)!
    const reply = lines.find((l) => l.text.includes('replied'))!
    expect(reply).toMatchObject({ text: '  ↳ a local model replied: <b>Thanks!</b> tetris is in there too.', tone: 'muted' })
    // Plain text: nothing in an output line is ever markup.
    expect(Object.keys(reply).sort()).toEqual(['text', 'tone'])
    expect(lines.at(-1)).toMatchObject({ text: '    why games', href: '/?run=why%20games' })
  })
})

describe('the owner’s sudo', () => {
  const HELD = [
    { id: 'h1aaaa', name: 'Bob', message: 'buy pills', status: 'held', reason: 'spam', ageMs: 5 * 60_000 },
    { id: 'p2bbbb', name: 'Cy', message: 'hello', status: 'pending', ageMs: 60_000 },
  ]

  it('lists what is held and waiting, as held/ files, after the password', async () => {
    api.heldGuestbook.mockResolvedValue(HELD)
    const out = text(await sudoWith(['guestbook', 'held']))
    expect(api.heldGuestbook).toHaveBeenCalledWith('pw')
    expect(out).toMatch(/held\s+spam\s+5 min\s+held\/bob-h1aaaa\.txt/)
    expect(out).toMatch(/pending\s+-\s+1 min\s+held\/cy-p2bbbb\.txt/)
    expect(out).toContain('  Bob: buy pills')
  })

  it('approves one by its file, and refuses a wrong password', async () => {
    api.heldGuestbook.mockResolvedValue(HELD)
    await sudoWith(['guestbook', 'held'])

    api.approveGuestbookEntry.mockRejectedValueOnce(new ApiError('Not the admin', 403))
    expect(text(await sudoWith(['approve', 'held/bob-h1aaaa.txt'], 'nope'))).toContain('sudo: incorrect password')

    api.approveGuestbookEntry.mockResolvedValue(undefined)
    expect(text(await sudoWith(['approve', 'held/bob-h1aaaa.txt']))).toContain('published held/bob-h1aaaa.txt')
    expect(api.approveGuestbookEntry).toHaveBeenLastCalledWith('h1aaaa', 'pw')
  })

  it('removes a held entry with sudo rm, and knows no file it wasn’t shown', async () => {
    api.heldGuestbook.mockResolvedValue(HELD)
    await sudoWith(['guestbook', 'held'])
    api.deleteGuestbookEntry.mockResolvedValue(undefined)
    expect(text(await sudoWith(['rm', 'held/cy-p2bbbb.txt']))).toContain('removed guestbook/held/cy-p2bbbb.txt')
    expect(api.deleteGuestbookEntry).toHaveBeenCalledWith('p2bbbb', 'pw')
    expect(text(await sudoWith(['approve', 'held/nobody-000000.txt']))).toContain('no such held entry')
  })
})
