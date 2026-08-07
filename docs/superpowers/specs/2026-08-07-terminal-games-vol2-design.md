# Design spec — terminal games, vol. 2 (wordle, minesweeper, wpm, tetris, hangman)

Status: proposed. Follows [the 2048/snake spec](2026-08-04-terminal-games-design.md), which shipped
`ctx.capture()` and the pure-state-module / renderer split. This spec adds five games on top of that
machinery and introduces **no new `CommandContext` primitive** — if one turns out to be needed,
that is a signal the design is wrong.

## Context

`games` currently lists two. The infrastructure the first two paid for is now free:

- `ctx.capture()` holds the keyboard, and `execute()`'s `finally` releases it unconditionally.
- `keyStream()` (`games/input.ts`) is the pull-based reader over it, buffered so nothing is dropped.
- `ctx.frame()` redraws a region in place; `segmented()` gives per-cell tone; `pre` keeps columns.
- `bestScore`/`recordScore` persist one integer per game in `localStorage`.
- `games-command.spec.ts` has a `harness()` that drives a real command through a stub context.
  Every game below gets its achievement proved through that same harness.

So the marginal cost of a sixth game is the game, not the plumbing. That is the whole reason to add
five at once rather than one per quarter.

## What changes outside the games themselves

Three shared things move, and they move once rather than five times.

### 1. `q` stops being the universal quit key

Three of these games (`wordle`, `hangman`, `wpm`) read **letters**, and `q` is a letter. It cannot
also mean quit.

It does not have to. `Escape` and `Ctrl+C` already abort a captured command —
`TerminalOverlay.vue`'s `onPanelKeydown` carves `Escape` out specifically so that quitting a game
does not also dismiss the overlay, and `handleCaptureKeydown` refuses modifier combos so `Ctrl+C`
always reaches `cancel()`. Both paths already work for every game shipped.

So: **`Esc` / `Ctrl+C` is the documented exit for all seven games.** The grid games (`2048`,
`snake`, `minesweeper`, `tetris`) keep `q` as a convenience because it costs one line and players
expect it; the letter games simply do not have it, and nobody is trapped.

Consequence: `messages.ts`'s `terminal.playing` — the prompt-row label shown while *any* capture is
active — currently reads `-- playing: arrows/wasd · q or ctrl+c to quit --`. It names controls that
are wrong for four of the seven. It becomes control-agnostic (`-- playing: esc or ctrl+c to quit --`)
and each game states its own controls in its own hint line, which is where a player is looking
anyway.

### 2. `scores.ts` learns that lower can be better

Minesweeper's natural score is **time**, where lower wins. `recordScore` is `Math.max` today.

The table gains a direction:

```ts
const GAMES: Record<GameId, { key: string; better: 'higher' | 'lower' }>
```

`bestScore` keeps returning `0` for "never played" in both directions — for a lower-is-better game
that is unambiguous because a cleared board always takes at least one second, and `recordScore`
ignores a non-positive score rather than letting a 0 become an unbeatable record. `games` renders a
`lower` game's best with a unit (`best: 48s`) so the number is not read as a high score.

This is the smallest honest change. The alternative — inverting minesweeper's score so "higher is
better" holds (`1000 - seconds`) — makes the stored number meaningless and the display a second
piece of arithmetic. Not worth it to keep a one-line function one line.

### 3. `games` becomes count-driven

It currently hardcodes `🕹  two games, in this buffer` / `deux jeux` in both locales, and prints
2048's control hint as if it applied generally. Both break at three games, never mind seven.

One `GAMES` table in `commands/games.ts` drives the listing, the count in the header, and the
`GameId` rows; the trailing hint becomes generic. The per-game controls move into each game's own
in-play hint line.

## The games

Same split as before: a **pure state module** in `terminal/games/` (plain functions over plain
objects — no Vue, no `OutputLine`, no timers, unit-testable) and a **renderer** in
`commands/games.ts` that turns state into `OutputLine[]` for `ctx.frame()`.

Build order is deliberate: the two turn-based grid games first (they are closest to code that
exists), then the word games (they share a list), then tetris (the only one with a tick).

### `wordle` — the one that earns its place on this site

The pick of the five, because it is the only game here that gets *better* from the site being
bilingual. The word list has an `en` and an `fr` half and `ctx.locale` chooses; playing in French
gives you a French word, with accents folded on comparison so `EPEE` matches `ÉPÉE`.

```ts
type Mark = 'hit' | 'near' | 'miss'
score(guess: string, answer: string): Mark[]   // two-pass, duplicates handled
```

- 5 letters, 6 rows. `hit` → `success`, `near` → `warning`, `miss` → `muted`, on the tones that
  exist. Unguessed rows are `·····` in `muted`.
- Letters type, `Backspace` deletes, `Enter` submits. A guess not in the list is refused with a
  status line rather than consuming a row.
- A used-letter keyboard row under the grid, tinted with each letter's best mark so far — this is
  most of what makes the game playable and it is six lines of render code.
- **Duplicate handling is the only real logic**, and it is the thing every naive implementation
  gets wrong: count the answer's letters, spend them on exact hits first, then on near-misses
  left-to-right. Two tests pin it (`SPEED` vs `ERASE`, `ARRAY` vs `RADAR`).
- Score is the **streak** — consecutive solves, reset by a loss. `r` starts the next word.

**Word lists: generated, not written.** See [the word-list addendum](#addendum--real-word-lists)
below — the first cut of this spec called for a few hundred hand-picked words per locale, and that
turned out to be the wrong call for reasons worth recording.

### `minesweeper`

Turn-based, so no tick and no reduced-motion branch — the same reason 2048 was built first.

```ts
type Cell = { mine: boolean; revealed: boolean; flagged: boolean; near: number }
reveal(state, x, y): State     // flood-fills the zero region
toggleFlag(state, x, y): State
isWon(state): boolean          // every non-mine cell revealed
```

- 16×10, 25 mines. Fits the buffer at two characters per cell without wrapping the panel.
- **First click is never a mine** — mines are laid *after* it, excluding the opened cell and its
  neighbours. Losing on move one is not a difficulty, it is a bug that looks like one.
- Cursor moves on arrows/`wasd`, `space` reveals, `f` flags, `q` quits. Numbers 1–8 take the tone
  ladder (`primary` → `accent` → `warning` → `error`), mines `error`, flags `warning`, unrevealed
  `muted`.
- Losing reveals the whole field, as every implementation does, and leaves it in the buffer.
- Score is **seconds to clear**, lower better (see above). Timer starts on the first reveal, not on
  launch — thinking time before you commit is not part of the run.

### `wpm` — a typing test, which in a terminal is barely a game

The best thematic fit of the five and the cheapest to build.

**Prompt text: random common words**, drawn from the same generated lists as wordle (see the
addendum). An earlier draft typed lines of Jules's own résumé, which was charming and measured the
wrong thing: prose lets you predict what comes next and coast, so it scores reading as much as
typing. Twelve words a line, drawn with replacement — de-duplicating would bias the draw towards
rare words, and a word repeating inside one line is normal in both languages.

- Pure module tracks `{ target, typed, startedAt }` and derives `wpm` (chars/5 ÷ minutes) and
  accuracy. No timer of its own — it reads `Date.now()` on each keystroke, so there is nothing to
  tear down and nothing to abort.
- Render: the target line with each character toned by state — correct `success`, wrong `error`
  (showing the *expected* character, not the typed one, so the line stays readable), untyped
  `muted` — and a cursor block on the next character.
- Ends on the last character. `Backspace` corrects and un-counts, but a character typed wrong once
  stays counted against accuracy, which is how every typing test works and the only way accuracy
  means anything.
- Score is **wpm**. The achievement needs 60 wpm at ≥95% accuracy, so speed alone does not pay.

### `tetris` — reversing a decision

The 2026-08-04 spec put Tetris **out of scope**: *"rotation, kicks and gravity are an order of
magnitude more code than either of these, for a game that reads worse in a monospace grid."*
Both halves of that were right then and are wrong now:

- **"Order of magnitude more code"** was true when gravity meant building a tick loop. Snake built
  it — the push-based `pressed` variable + `sleep(TICK_MS, signal)` pattern in `playSnake` is
  copied, not invented. What is left is a piece table and a collision test.
- **"Kicks"** assumed SRS. It is not required and will not be implemented: rotation tries in place,
  then one cell left, then one right, then refuses. That is three lines and it is what a player
  feels as "the rotation works".
- **"Reads worse in a monospace grid"** is a rendering choice, not a fact about the game. A
  character cell is about 1:2, so a well drawn one character per cell is squashed to half height.
  Drawing **two characters per cell** makes it square. `2048`'s `CELL_WIDTH` already establishes
  that the renderer picks a cell width.

Design:

- 10×18 well, seven pieces as 4×4 bitmask tables (four rotations each, precomputed — a rotation
  function would be shorter to write and harder to read than the shapes themselves).
- Arrows/`wasd` move and rotate, `space` hard-drops, `q` quits. 500 ms tick, unchanged by level —
  no speed curve, because a game that gets faster wants a pause key and a difficulty setting, and
  this is a portfolio easter egg.
- Line clears score 100/300/500/800 for 1/2/3/4, the standard table.
- **Reduced motion:** this is the one game where the snake fallback (step per keypress) is genuinely
  odd, because gravity *is* the game. It gets the honest version instead: no tick, and each keypress
  advances gravity one row — so the piece falls exactly as fast as you play. It is a different,
  more deliberate game, and it beats refusing to run, which is the rule the whole codebase follows.

### `hangman` — nearly free once wordle exists

Shares `games/words.ts`, so the marginal cost is the gallows art and a guessed-letters set. Not
worth building alone; obviously worth building second.

- 6 wrong guesses, drawn as the usual gallows in `art()`-style `pre` lines, one stage per miss.
- Word shown as `_ _ _ _`, guessed letters listed below with misses in `error`.
- Repeating a letter is refused without costing a life — punishing a mis-key is not difficulty.
- Locale picks the list, same as wordle. Score is the **win streak**.

## Achievements

Five entries appended to `achievementList`, taking it from 30 to 35. `completionist` stays last and
cascades over whatever the total is; the counter already reads `achievementList.length`, so nothing
displays a stale denominator.

| id | title (en / fr) | unlocks on |
|---|---|---|
| `wordle` | Word Play / Jeu de mots | solving a wordle |
| `minesweeper` | Clean Sweep / Déminage | clearing a minesweeper board |
| `wpm` | Touch Typist / Dactylo | 60 wpm at ≥95% accuracy |
| `tetris` | Line Clear / Ligne complète | clearing 10 lines in one game |
| `hangman` | Last Word / Le mot de la fin | winning a hangman round |

Hints stay oblique, per the existing convention — nudge, never name the command.

**The skill-gate trade-off, revisited.** The first spec flagged that `game2048`/`snake` were the
first achievements needing skill rather than curiosity, and set thresholds reachable in about two
minutes by anyone who had played before. These five hold that line: solving one wordle, clearing
one board, and winning one hangman are all *single successes*, not scores. Only `wpm` and `tetris`
are graded, and both sit near "competent adult", not "practised player". `completionist` stays a
matter of persistence.

## Accessibility

Unchanged from the first spec and worth restating, because five more games do not change the honest
position: these are visual games, a screen reader cannot play them, the output region sets
`aria-live="off"` while a capture is active, and the terminal is desktop-only (`hidden` below `md`).

What is new:

- The **letter games are the most screen-reader-tractable things here** — `wpm` in particular is
  just text with a cursor. They still are not announced, because the live region is off for the
  whole capture. Making the region announce per-game is a real feature, and it is not this one.
- Every game exits on `Esc` and `Ctrl+C` (§1), so the "nobody is trapped" guarantee now holds
  uniformly rather than per-game.

## Testing

- One vitest spec per pure module in `terminal/__tests__/`, mirroring `game-2048.spec.ts`:
  `game-wordle.spec.ts`, `game-minesweeper.spec.ts`, `game-typing.spec.ts`, `game-tetris.spec.ts`,
  `game-hangman.spec.ts`.
- `games-command.spec.ts` grows a block per game, driving the real command through the existing
  `harness()` until the achievement falls — including the abort path, which is the case the return
  value cannot cover.
- The word list gets a shape test: fixed length, uppercase, no duplicates, every answer also
  present in the accepted-guess set.

## Out of scope

Carried over unchanged from the first spec — **leaderboards** (a publicly writable score store is
the guestbook's spam problem without the charm), **pause/resume across a terminal close**, and
**mobile**. Newly declined:

- **A difficulty setting for minesweeper.** One board size, tuned once. `minesweeper --expert` is a
  flag nobody types on a portfolio.
- **A wordle daily word.** A shared word means server state and a date boundary to argue with, for
  a feature whose entire appeal is comparing with other people — which is the leaderboard problem
  again. Random word, play as many as you like.
- **Tetris hold, ghost piece and next-piece preview.** Next-piece is arguably free and still not
  shipped: three more render regions around a well that is already the widest thing in the buffer.


---

## Addendum — real word lists

*Added after the five games shipped. The lists this spec originally called for were hand-written,
and they were the weakest part of the release: ~440 answers per locale, no frequency data, and — in
French — no way to tell a headword from a conjugation, so `ABOYA` and `ABUSÉ` sat in the answer pool
next to `TABLE`. This replaces them with generated ones.*

### Constraint that shaped every choice

**Permissive licensing only.** That rules out most of the obvious lexical resources, and the ruling
out is the interesting part:

| Source | Licence | Verdict |
|---|---|---|
| [SCOWL](https://github.com/en-wl/wordlist), via `wordlist-english` | MIT | **used** — English, everything |
| [`an-array-of-french-words`](https://github.com/words/an-array-of-french-words) | MIT | **used** — French word membership |
| [`dictionary-fr`](https://grammalecte.net/) (Grammalecte/Dicollecte) | MPL-2.0 | **used** — French lemmas |
| [Tatoeba](https://tatoeba.org/) sentence export | CC BY 2.0 FR | **used** — French frequency |
| [Lexique383](http://www.lexique.org/) | CC BY-**SA** 4.0 | rejected — share-alike |
| [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords) | code MIT, **lists CC BY-SA 3.0** | rejected — the trap is that the repo advertises MIT |
| [Monkeytype](https://github.com/monkeytypegame/monkeytype) word lists | GPLv3 | rejected — copyleft, would reach the frontend |
| [`google-10000-english`](https://github.com/first20hours/google-10000-english) | LDC, "educational/personal use" | rejected — not permissive |
| [Leipzig Corpora](https://wortschatz.uni-leipzig.de/) | stated as CC BY 3.0 / 4.0 / BY-SA on different pages | rejected — cannot rely on a licence the source is unclear about |

MPL-2.0 is file-level copyleft: the generated French file inherits it and carries the notice, and
nothing else in the project is affected. CC BY is attribution-only. Both are recorded in the header
of the file they apply to and in the README.

### Why English needs one source and French needs three

SCOWL is **size-graded** (10/20/35/…/70), and that grading is precisely the split the games want:
size ≤35 is "common enough to be a fair answer", ≤70 is "a real word", ≤10 is "worth typing". No
frequency corpus required.

French has no equivalent, so commonness has to be assembled:

- the MIT array answers *is this a word?* — 6806 five-letter entries, accents intact
- the hunspell dictionary answers *is this a headword?* — dropping the conjugations that made the
  hand-written list unfair
- Tatoeba answers *is it common?* — 722k sentences, tokenised elision-aware so `qu'il` counts as
  `il` rather than putting the fragment `qu` in the top thirty words

Drop any one and the pool fills with either conjugations or obscurities.

### Shape

```
              answers   accepted   typing
english          3497       6500     3527
french            969       5891     1261
```

Answers are uppercase with accents intact (they are displayed); accepted guesses are folded (they
are typed). French answers are **deduplicated by folded form** — `cote` and `côté` are two entries
but one puzzle, and the more frequent spelling wins the slot.

### Generation and delivery

`scripts/build-wordlists.mjs`, run by hand via `npm run wordlists`, **output committed**. Not a vite
plugin: the build must stay reproducible offline and CI must not depend on tatoeba.org being up.

The two generated files are ~140 kB of source, ~60 kB gzipped. Bundled into the main chunk that
would be a third of the page's transfer budget, paid at first paint by the majority of visitors who
never open the terminal. So they are behind `import()` — one chunk per locale, fetched the first
time someone runs a word game — and excluded from the PWA precache with a runtime
StaleWhileRevalidate rule instead. Exactly the treatment `ThreeBackground` already gets, for exactly
the same reason.

Consequence for the pure modules: `newGame` **takes its words as an argument** rather than importing
them. That keeps the state modules pure, keeps the async boundary in the command layer where the
loading line lives, and lets the specs run against five-word fixtures instead of several thousand
real ones. The generated lists get their own shape checks — length, folding, no duplicates, every
answer accepted — so a bad regeneration fails in CI rather than in someone's game.
