import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomSnapshot } from '@/lib/api'
import { recordingContext } from './context'

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  move: vi.fn(),
  rematch: vi.fn(),
  endRoom: vi.fn(),
}))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, ...api } }
})

import { ApiError } from '@/lib/api'
import { bestScore } from '../games/scores'
import { command } from '../commands/games/connect4'

/** Stands in for the room's event stream: the spec pushes snapshots through it. */
class FakeEventSource {
  static readonly CLOSED = 2
  static last: FakeEventSource | null = null
  readyState = 1
  closed = false
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) {
    FakeEventSource.last = this
  }
  emit(snapshot: RoomSnapshot) {
    this.onmessage?.({ data: JSON.stringify(snapshot) } as MessageEvent<string>)
  }
  end() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.()
  }
  close() {
    this.closed = true
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function room(moves: number[], extra: Partial<RoomSnapshot> = {}, seats: 1 | 2 = 2, starter: 0 | 1 = 0): RoomSnapshot {
  return {
    code: 'ABCDE',
    kind: 'connect4',
    state: { media: null, position: 0, playing: false, at: 0 },
    queue: [],
    members: seats,
    game: { moves, seats, starter },
    ...extra,
  }
}

function start(args: string[] = []) {
  const controller = new AbortController()
  const recorded = recordingContext('connect4', args, { signal: controller.signal })
  const finished = Promise.resolve(command.run(recorded.ctx))
  const screen = () => recorded.printed.map((l) => l.text).join('\n')
  return { ...recorded, finished, screen, quit: () => controller.abort() }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('EventSource', FakeEventSource)
  FakeEventSource.last = null
  for (const mock of Object.values(api)) mock.mockReset()
  api.endRoom.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connect4, as the host', () => {
  beforeEach(() => {
    api.createRoom.mockResolvedValue({ ...room([], {}, 1), hostToken: 'host' })
  })

  it('opens a game room and waits, printing the code to share', async () => {
    const game = start()
    await tick()
    expect(api.createRoom).toHaveBeenCalledWith('connect4')
    expect(FakeEventSource.last!.url).toContain('/rooms/ABCDE/events')
    expect(game.screen()).toContain('on another machine: connect4 ABCDE')
    game.quit()
    await expect(game.finished).rejects.toThrow()
  })

  it('plays a whole game: aim, drop, win, rematch, and closes the room on the way out', async () => {
    const game = start()
    await tick()
    FakeEventSource.last!.emit(room([]))
    await tick()
    expect(game.screen()).toContain('your turn')

    api.move.mockResolvedValueOnce(room([3]))
    game.press('4')
    await tick()
    expect(api.move).toHaveBeenCalledWith('ABCDE', 'host', 3)
    expect(game.screen()).toContain('their turn')

    // The opponent's reply arrives on the stream; three in a column each.
    FakeEventSource.last!.emit(room([3, 2, 3, 2, 3, 2]))
    await tick()
    api.move.mockResolvedValueOnce(room([3, 2, 3, 2, 3, 2, 3]))
    game.press('ArrowLeft') // aim is at 3 already; move away and back to prove aiming
    game.press('ArrowRight')
    game.press('Enter')
    await tick()
    expect(api.move).toHaveBeenLastCalledWith('ABCDE', 'host', 3)
    expect(game.screen()).toContain('you win')
    expect(game.screen()).toContain('◉')

    api.rematch.mockResolvedValueOnce(room([], {}, 2, 1))
    game.press('r')
    await tick()
    expect(api.rematch).toHaveBeenCalledWith('ABCDE', 'host')
    expect(game.screen()).toContain('their turn')

    game.quit()
    await expect(game.finished).rejects.toThrow()
    expect(FakeEventSource.last!.closed).toBe(true)
    expect(api.endRoom).toHaveBeenCalledWith('ABCDE', 'host')
    expect(bestScore('connect4')).toBe(1)
  })

  it('refuses to drop out of turn or into a full column without asking the server', async () => {
    const game = start()
    await tick()
    FakeEventSource.last!.emit(room([3]))
    await tick()
    game.press('1')
    await tick()
    expect(game.screen()).toContain('not your turn')

    FakeEventSource.last!.emit(room([0, 0, 0, 0, 0, 0]))
    await tick()

    game.press('1')
    await tick()
    expect(game.screen()).toContain('that column is full')
    expect(api.move).not.toHaveBeenCalled()
    game.quit()
    await expect(game.finished).rejects.toThrow()
  })

  it('says when the opponent has left', async () => {
    const game = start()
    await tick()
    FakeEventSource.last!.emit(room([3, 4], { members: 1 }))
    await tick()
    expect(game.screen()).toContain('your opponent left the room')
    game.quit()
    await expect(game.finished).rejects.toThrow()
  })

  it('says rooms are off, and opens nothing, when the server has them off', async () => {
    api.createRoom.mockRejectedValue(new ApiError('Rooms are off', 403))
    const game = start()
    await game.finished
    expect(game.screen()).toContain('rooms are switched off on this server')
    expect(FakeEventSource.last).toBeNull()
  })
})

describe('connect4 <code>, as the guest', () => {
  it('takes the second seat and plays second, without closing the room when it leaves', async () => {
    api.joinRoom.mockResolvedValue({ ...room([]), seatToken: 'seat' })
    const game = start(['abcde'])
    await tick()
    expect(api.joinRoom).toHaveBeenCalledWith('ABCDE')
    FakeEventSource.last!.emit(room([]))
    await tick()
    expect(game.screen()).toContain('their turn')

    FakeEventSource.last!.emit(room([3]))
    await tick()

    api.move.mockResolvedValueOnce(room([3, 3]))
    game.press('4')
    await tick()
    expect(api.move).toHaveBeenCalledWith('ABCDE', 'seat', 3)

    game.quit()
    await expect(game.finished).rejects.toThrow()
    expect(api.endRoom).not.toHaveBeenCalled()
  })

  it('explains a full room, an unknown one, and a malformed code', async () => {
    api.joinRoom.mockRejectedValueOnce(new ApiError('The room is full', 409))
    const full = start(['ABCDE'])
    await full.finished
    expect(full.screen()).toContain('already has two players')

    api.joinRoom.mockRejectedValueOnce(new ApiError('No such room', 404))
    const unknown = start(['ZZZZZ'])
    await unknown.finished
    expect(unknown.screen()).toContain('no such room')

    const malformed = start(['nope'])
    await malformed.finished
    expect(malformed.screen()).toContain('five letters or digits')
  })

  it('ends when the room closes under it', async () => {
    api.joinRoom.mockResolvedValue({ ...room([]), seatToken: 'seat' })
    const game = start(['ABCDE'])
    await tick()
    FakeEventSource.last!.end()
    await game.finished
    expect(game.screen()).toContain('the room has closed.')
  })
})
