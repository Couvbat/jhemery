import type { Localised } from '@/content/types'
import { api, ApiError, roomEventsUrl, type RoomSnapshot } from '@/lib/api'
import { normaliseCode } from '@/rooms/sync'
import { blank, line, segmented } from '../../format'
import * as c4 from '../../games/connect4'
import { abortError } from '../../timing'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { play, runs } from './shared'

/**
 * Connect four against another visitor, over a room code — the first game here with
 * two people in it. It rides on the rooms (`backend/src/rooms`): `connect4` opens a
 * game room and prints its code, `connect4 <code>` takes the second seat, and both
 * players' terminals follow the room's event stream. The rules are `games/connect4.ts`,
 * replayed from the move list on each side; the server only keeps the list honest.
 *
 * Same caps, TTL and `ROOMS_ENABLED` switch as the watch parties. Not linkable: it
 * creates a room or claims a seat, which is a write a link's author must not make on
 * the reader's behalf.
 */

const T = {
  hint: {
    en: '←/→ or a/d to aim · enter or 1–7 to drop · esc quits',
    fr: '←/→ ou a/d pour viser · entrée ou 1–7 pour lâcher · esc pour quitter',
  },
  waiting: {
    en: 'waiting for a second player — on another machine: connect4 {code}',
    fr: 'en attente d’un second joueur — sur une autre machine : connect4 {code}',
  },
  yourTurn: { en: 'your turn', fr: 'à vous' },
  theirTurn: { en: 'their turn…', fr: 'à l’adversaire…' },
  won: { en: 'four in a row — you win · r for a rematch', fr: 'quatre alignés — vous gagnez · r pour une revanche' },
  lost: { en: 'they win · r for a rematch', fr: 'l’adversaire gagne · r pour une revanche' },
  draw: { en: 'a draw — the board is full · r for a rematch', fr: 'match nul — la grille est pleine · r pour une revanche' },
  left: { en: 'your opponent left the room', fr: 'votre adversaire a quitté la salle' },
  notYours: { en: 'not your turn', fr: 'ce n’est pas à vous' },
  full: { en: 'that column is full', fr: 'cette colonne est pleine' },
  gone: { en: 'the room has closed.', fr: 'la salle est fermée.' },
  off: {
    en: 'rooms are switched off on this server, and connect four needs one.',
    fr: 'les salles sont désactivées sur ce serveur, et le puissance 4 en a besoin.',
  },
  noRoom: { en: 'connect4: no such room', fr: 'connect4 : salle introuvable' },
  roomFull: { en: 'connect4: that room already has two players', fr: 'connect4 : cette salle a déjà deux joueurs' },
  notGame: { en: 'connect4: that code is not a game room', fr: 'connect4 : ce code n’est pas une salle de jeu' },
  badCode: { en: 'connect4: a room code is five letters or digits', fr: 'connect4 : un code de salle fait cinq lettres ou chiffres' },
  unreachable: { en: 'connect4: the server did not answer', fr: 'connect4 : le serveur n’a pas répondu' },
  you: { en: 'you', fr: 'vous' },
  them: { en: 'them', fr: 'adversaire' },
} satisfies Record<string, Localised>

/** Green for the host, amber for the guest: each player sees the same colours. */
const SEAT_TONES: Record<c4.Seat, Tone> = { 0: 'success', 1: 'warning' }

type Event = { kind: 'key'; key: string } | { kind: 'snapshot'; snapshot: RoomSnapshot } | { kind: 'gone' }

/** One queue for both sources of events — the keyboard and the room — so the game
 *  loop awaits a single thing and never races itself. */
function inbox() {
  const queue: Event[] = []
  let wake: (() => void) | null = null
  return {
    push(event: Event) {
      queue.push(event)
      wake?.()
      wake = null
    },
    async next(signal: AbortSignal): Promise<Event> {
      while (!queue.length) {
        if (signal.aborted) throw abortError()
        await new Promise<void>((resolve, reject) => {
          wake = resolve
          signal.addEventListener('abort', () => reject(abortError()), { once: true })
        })
      }
      return queue.shift()!
    },
  }
}

function explain(error: unknown): Localised {
  if (!(error instanceof ApiError)) return T.unreachable
  if (error.status === 403) return T.off
  if (error.status === 404) return T.noRoom
  if (error.status === 409) return T.roomFull
  if (error.status === 400) return T.notGame
  return T.unreachable
}

interface View {
  code: string
  me: c4.Seat
  snapshot: RoomSnapshot
  cursor: number
  message: Localised | null
}

export function render(view: View, t: CommandContext['t']): OutputLine[] {
  const game = view.snapshot.game ?? { moves: [], seats: 1, starter: 0 }
  const state = c4.replay(game.moves, game.starter)
  const them: c4.Seat = view.me === 0 ? 1 : 0
  const winning = new Set(state.line.map(([r, c]) => `${r},${c}`))
  const myTurn = game.seats === 2 && !state.over && state.next === view.me

  const status: Localised =
    view.message ??
    (game.seats < 2
      ? T.waiting
      : state.winner !== null
        ? state.winner === view.me
          ? T.won
          : T.lost
        : state.draw
          ? T.draw
          : view.snapshot.members < 2
            ? T.left
            : myTurn
              ? T.yourTurn
              : T.theirTurn)

  const rows: OutputLine[] = state.board.map((row, r) =>
    segmented([
      { text: '  │', tone: 'muted' },
      ...runs(
        row.flatMap((cell, c) => [
          { char: ' ', tone: 'muted' as Tone },
          cell === null
            ? { char: '·', tone: 'muted' as Tone }
            : { char: winning.has(`${r},${c}`) ? '◉' : '●', tone: SEAT_TONES[cell] },
        ]),
      ),
      { text: ' │', tone: 'muted' },
    ]),
  )

  const header: OutputSegment[] = [
    { text: `connect4 · ${view.code} · `, tone: 'muted' },
    { text: '● ', tone: SEAT_TONES[view.me] },
    { text: `${t(T.you)}  `, tone: 'default' },
    { text: '● ', tone: SEAT_TONES[them] },
    { text: t(T.them), tone: 'default' },
  ]

  return [
    segmented(header),
    blank,
    segmented([{ text: `   ${' '.repeat(view.cursor * 2)}${myTurn ? '▼' : ' '}`, tone: SEAT_TONES[view.me] }]),
    ...rows,
    segmented([{ text: `  └${'─'.repeat(c4.COLUMNS * 2 + 1)}┘`, tone: 'muted' }]),
    segmented([{ text: `    ${Array.from({ length: c4.COLUMNS }, (_, i) => i + 1).join(' ')}`, tone: 'muted' }]),
    blank,
    line(t(status).replace('{code}', view.code), myTurn || state.winner === view.me ? 'primary' : 'muted'),
    line(t(T.hint), 'muted'),
  ]
}

export const command: Command = {
  name: 'connect4',
  aliases: ['c4', 'puissance4'],
  usage: 'connect4 [<code>]',
  description: {
    en: 'Connect four against another visitor, over a room code',
    fr: 'Puissance 4 contre un autre visiteur, avec un code de salle',
  },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'connect4', async (session) => {
      const { t } = ctx
      const asked = ctx.args[0]

      let code: string
      let token: string
      let me: c4.Seat
      let snapshot: RoomSnapshot
      try {
        if (asked) {
          const normalised = normaliseCode(asked)
          if (!normalised) {
            ctx.print(line(t(T.badCode), 'error'))
            return
          }
          const joined = await api.joinRoom(normalised)
          ;({ code, seatToken: token } = joined)
          me = 1
          snapshot = joined
        } else {
          const created = await api.createRoom('connect4')
          ;({ code, hostToken: token } = created)
          me = 0
          snapshot = created
        }
      } catch (error) {
        ctx.print(line(t(explain(error)), 'error'))
        return
      }

      const events = inbox()
      const release = ctx.capture((key) => events.push({ kind: 'key', key }))
      const source = new EventSource(roomEventsUrl(code))
      source.onmessage = (event: MessageEvent<string>) => {
        try {
          events.push({ kind: 'snapshot', snapshot: JSON.parse(event.data) as RoomSnapshot })
        } catch {
          // A malformed frame is not worth leaving the game over.
        }
      }
      // Closed for good means the room has gone (ended by the host, or idled out);
      // anything else is EventSource reconnecting on its own.
      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) events.push({ kind: 'gone' })
      }

      const view: View = { code, me, snapshot, cursor: 3, message: null }
      const draw = ctx.frame()
      const paint = () => draw(render(view, t))
      /** The round last counted as a win, so one win is one point however often it is redrawn. */
      let counted = -1
      let wins = 0
      const tally = () => {
        const game = view.snapshot.game
        if (!game) return
        const state = c4.replay(game.moves, game.starter)
        const round = game.starter * 1000 + game.moves.length
        if (state.winner === me && counted !== round) {
          counted = round
          wins++
          session.score = wins
        }
      }
      paint()

      const send = async (request: () => Promise<RoomSnapshot>) => {
        try {
          view.snapshot = await request()
          view.message = null
          tally()
        } catch (error) {
          view.message = error instanceof ApiError && error.status === 409 ? T.notYours : explain(error)
        }
      }

      try {
        for (;;) {
          const event = await events.next(ctx.signal)
          if (event.kind === 'gone') {
            ctx.print(line(t(T.gone), 'muted'))
            return
          }
          if (event.kind === 'snapshot') {
            view.snapshot = event.snapshot
            view.message = null
            tally()
            paint()
            continue
          }

          const game = view.snapshot.game ?? { moves: [], seats: 1 as const, starter: 0 as const }
          const state = c4.replay(game.moves, game.starter)
          const key = event.key
          let column: number | null = null

          if (key === 'ArrowLeft' || key === 'a') view.cursor = Math.max(0, view.cursor - 1)
          else if (key === 'ArrowRight' || key === 'd') view.cursor = Math.min(c4.COLUMNS - 1, view.cursor + 1)
          else if (/^[1-7]$/.test(key)) column = view.cursor = Number(key) - 1
          else if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 's') column = view.cursor
          else if (key === 'r' && state.over) await send(() => api.rematch(code, token))
          else continue

          if (column !== null && game.seats === 2 && !state.over) {
            if (state.next !== me) view.message = T.notYours
            else if (c4.landingRow(state.board, column) === null) view.message = T.full
            else await send(() => api.move(code, token, column!))
          }
          paint()
        }
      } finally {
        release()
        source.close()
        // The host closing the terminal closes the room: the guest's stream ends and
        // their terminal says so, rather than both waiting on a room nobody is in.
        if (me === 0) void api.endRoom(code, token).catch(() => undefined)
      }
    }),
}
