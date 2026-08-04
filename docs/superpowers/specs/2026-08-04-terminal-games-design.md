# Design spec — terminal games (2048, snake)

Status: proposed. Not implemented. Introduces one addition to `CommandContext` (`capture`) that
[the `ask` command spec](2026-08-04-ask-command-design.md) does not need but
[the CTF chain](2026-08-04-ctf-flag-chain-design.md) may later reuse; this spec owns it.

## Context

Two playable games in the terminal output buffer: 2048 and snake. They are the first commands that
need to hold the keyboard for a sustained period rather than reading one line at a time.

Almost everything they need already exists:

- `ctx.frame()` (`useTerminal.ts:58`) opens a redrawable region at the buffer tail. Each call
  replaces the rows the previous one wrote — already used by `sl` to slide a train without stacking
  a still of every position. That is a render loop.
- `ctx.signal` aborts a running command on `Ctrl+C`, and the `sleep(ms, signal)` helper in
  `commands/eggs.ts:43` already rejects cleanly on abort.
- `prefersReducedMotion()` in `useCrt.ts` is the single funnel every animated surface uses.
- `OutputLine.pre` preserves runs of spaces, and `Tone` gives eight colours for free.

What is missing is **keyboard input while a command is running**. Today keys reach either the input
line or the vim state machine (`TerminalOverlay.vue:76`), and nothing else.

## The primitive: `ctx.capture()`

`CommandContext` gains exactly one field:

```ts
/** Routes raw keys to `handler` while the command runs. Returns a release function;
 *  the release is also called automatically when the command settles. */
capture: (handler: (key: string) => void) => () => void
```

Push-based, not pull-based. A `nextKey(): Promise<string>` would look tidier for 2048 (await a key,
apply the move, redraw) but is wrong for snake: between the tick loop resolving a
`Promise.race([sleep(120), nextKey()])` and re-entering the next `await`, keypresses land with
nobody listening and are lost. Push-based means the game keeps a `direction` variable that the
handler writes and the tick loop reads, and no key is ever dropped. A pull-based
`nextKey(capture, signal)` helper is trivial to build on top for 2048 and lives in
`terminal/games/input.ts`, not in the context.

Implementation notes:

- `useTerminal` holds `keyCapture: ((key: string) => void) | null`. `execute()`'s existing `finally`
  block clears it unconditionally, so a game that throws cannot wedge the keyboard — the same reason
  `busy` and `abortController` are reset there.
- Only one capture at a time. A second `capture()` call replaces the first; commands do not nest.
- The handler receives `event.key` only. Modifier combos never reach it, mirroring the vim guard at
  `TerminalOverlay.vue:76` — `Ctrl+C` and `Ctrl+L` keep working throughout a game, which is how a
  visitor quits.

### Routing and the disabled-input problem

The input is `:disabled="busy && !pendingPrompt"` (`TerminalOverlay.vue:224`). A disabled input
fires no `keydown`, and blurring it drops focus out of the panel, so the panel-level handler would
not fire either. Games run with `busy === true`, so as written they would receive nothing.

Fix: treat an active capture the same way `pendingPrompt` is treated — the input stays enabled, gains
`readonly` so keystrokes never appear as text, and keeps focus. Keys then arrive at the existing
`onKeydown`, which checks capture **before** the vim branch (the two are mutually exclusive in
practice — vim commands return synchronously and never hold a capture — but the precedence should be
written down rather than inferred).

`Escape` needs a carve-out in `onPanelKeydown`: while a capture is active it aborts the command
rather than closing the overlay. Quitting a game should not also dismiss the terminal.

### Prompt row while playing

The prompt label switches from `couvbat:~$` to a muted hint — `-- playing: arrows/wasd · q or ctrl+c
to quit --` — reusing the same `promptLabel` computed that already swaps in the pending prompt's
question.

## The games

**Where:** `frontend/src/terminal/games/` (`2048.ts`, `snake.ts`, `input.ts`, `scores.ts`),
`frontend/src/terminal/commands/games.ts`.

Each game splits into a **pure state module** and a **renderer**. The state module exports plain
functions over plain objects — no Vue, no `OutputLine`, no timers — so the interesting logic is unit
testable with the vitest setup already in the repo (`guestbook.service.spec.ts`,
`rate-limit.guard.spec.ts` are the precedent). The renderer turns a state into `OutputLine[]` and
hands it to `ctx.frame()`.

### 2048

Build this one first: it is turn-based, so there is no tick loop and `prefers-reduced-motion` is a
non-issue.

```ts
type Board = number[]          // 16 cells, 0 = empty
move(board: Board, dir: Dir): { board: Board; gained: number; moved: boolean }
spawn(board: Board): Board     // 2 (90%) or 4 (10%) into a random empty cell
isDead(board: Board): boolean
```

- 4×4, rendered with box-drawing characters and `pre: true`. Tile colour by rank, mapped onto the
  existing `Tone` values: 2/4 `muted`, 8/16 `default`, 32/64 `primary`, 128/256 `accent`,
  512/1024 `warning`, 2048+ `success`. No new palette.
- Arrows and `wasd` move, `r` restarts, `q` quits. A move that changes nothing does not spawn a tile.
- Header line shows `score` and `best`; on death the frame is redrawn with a `game over` line and the
  board is left in the buffer as a record.

### Snake

- 24×12 grid, `·` for empty, `█` for the body, `◆` for food, framed in box-drawing characters.
- Walls kill. Wrapping makes for longer, duller games and a worse first impression.
- 120 ms tick via the existing `sleep(ms, signal)`; a reversal into your own neck is ignored rather
  than fatal, which is the convention every implementation of this game has settled on.
- **Reduced motion:** do not refuse the command — drop the tick and step the snake once per keypress.
  Turn-based snake is a real game, and it is a two-line difference. This is consistent with how
  `top` draws one frame instead of six rather than declining to run.

### Scores and the `games` command

High scores live in `localStorage` under `couvbat:games:2048` and `couvbat:games:snake`, following
the shape of the existing `couvbat:achievements` keys and wrapped in the same try/catch — private
browsing means scores do not persist, which is not an error worth surfacing.

`games` (alias `arcade`) lists what is available with the current best for each. Like `play` and
`achievements`, it is deliberately **not** `hidden` — it is a signpost, not a secret. `2048` and
`snake` themselves are also visible, in group `fun`. `palette: true` on `games` only: launching a
game from the command palette would put a visitor into a keyboard-captured surface they did not ask
for.

## Achievements

Two new entries in `achievementList`, following the existing hint convention (nudge, do not name the
command):

| id | title | unlocks on |
|---|---|---|
| `game2048` | Tile Merchant / Marchand de tuiles | reaching a 256 tile |
| `snake` | Nokia Nostalgia / Nostalgie Nokia | a snake of length 10 |

**Trade-off, stated deliberately:** these are the first skill-gated achievements, and both count
toward `completionist`, which until now required only curiosity. Both thresholds are reachable inside
two minutes by someone who has played either game before, which keeps 100% a matter of persistence
rather than reflexes. If that turns out to be wrong the escape hatch is to unlock on *playing* rather
than on scoring, changing one condition per game and no structure.

The list grows from 18 to 20, so the `n/18` counter in `AchievementsModal.vue` and the
`achievements` command must both read the list length rather than a literal. Existing visitors keep
`completionist` (it is already persisted; the cascade only ever adds), which is the correct
behaviour — a badge should not be revoked by a deploy.

## Accessibility

Honest position: these are visual games and a screen reader cannot play them.

- While a capture is active the output region sets `aria-live="off"`. A grid redrawn eight times a
  second through a polite live region is actively hostile, and this is the one place where the
  §9 `aria-live="polite"` rule has to yield.
- Games inherit the terminal's desktop-only availability (`hidden` below `md`) — no touch controls,
  no virtual D-pad.
- The reduced-motion turn-based mode above is the accessibility answer for motion sensitivity, and
  `Ctrl+C`, `q` and `Esc` all quit, so nobody is trapped the way the vim pane deliberately traps
  them.

## Out of scope

- **Leaderboards.** A publicly writable score store is the guestbook's spam problem with none of the
  guestbook's charm. Local best only.
- **Tetris.** Rotation, kicks and gravity are an order of magnitude more code than either of these,
  for a game that reads worse in a monospace grid.
- **Pause/resume across a terminal close.** Closing the overlay abandons the game; state is not
  persisted.
- **Mobile.** See §9 of features-spec.md.
