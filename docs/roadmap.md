# Roadmap — brainstormed features

Status tracker for the three-category feature brainstorm (three.js background, terminal commands,
live information). Built feature by feature, across sessions.

**How to use:** tick a box when the feature ships, and append the PR number. Design detail for
each row is the "approach" column — enough to act on without re-deriving. Anything that grows into
a real design gets its own `superpowers/specs/*-design.md` + `superpowers/plans/*.md` pair, linked
from its row.

Conventions that apply to every row, so they are not repeated:

- Every user-facing string is `Localised<{en, fr}>` via `useLocale()`/`t()`.
- Every animated surface checks `prefersReducedMotion()` (`composables/useCrt.ts`).
- New commands are one object appended to an array in `terminal/commands/*.ts`; `help`,
  tab-completion and the palette derive from the registry. `registry.spec.ts`'s generic invariants
  cover them for free.
- New pure logic gets a small vitest spec next to the existing ones in `terminal/__tests__/`.
- Verification per feature: `npm run type-check` + `npm run test` from `frontend/`, then manual in
  the browser preview (both locales, reduced motion on/off where it animates).
- README.md and `features-spec.md` get one line per shipped feature.

---

## A. Three.js background

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Pointer gravity well | Reuse already-tracked `mouseX`/`mouseY`; in `animate()`, spring each mesh toward/away from the projected pointer, ease back when idle. | `ThreeBackground.vue` | S |
| [x] | Click-to-inspect a shape | Pointer events on the canvas, `THREE.Raycaster` on click, tween camera to the hit mesh, small DOM label (`"icosahedron · 20 faces"`). | `ThreeBackground.vue` + overlay | M |
| [x] | Section-reactive palette/motion | Read `currentSection` from `useActiveSection.ts`; map section id → colour mix / speed, alongside the existing CRT `speedMultiplier`. | `ThreeBackground.vue` | S |
| [x] | Terminal-driven scene control | New `useSceneControl.ts` (shape of `useMatrix.ts`) exposing shape-count/gravity flags; `ThreeBackground.vue` watches them; hidden `spawn` / `gravity on\|off` commands. | `useSceneControl.ts` (new), `ThreeBackground.vue`, `eggs.ts` | M |
| [x] | Constellation / connect-the-dots | `THREE.LineSegments` recomputed each frame between shapes under a distance threshold (18 shapes ⇒ O(n²) is free), toggled by a reactive flag. | `ThreeBackground.vue`, composable, `eggs.ts` | M |
| [x] | Achievement-gated visual unlock | Import the already-reactive `unlocked` set from `achievements.ts`; branch the palette on `unlocked.value.has('completionist')`. | `ThreeBackground.vue` | S |
| [x] | Glitch burst | `useCrt.ts` already exports a reactive `glitching` ref (drives the CSS tear on `sudo rm -rf /`) — read it and jitter mesh positions for that window. No new trigger. | `ThreeBackground.vue` | S |

## B. Terminal commands

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `reboot` | Replays `BootSequence.vue` on demand. Full spec in [appendix](#appendix--reboot-and-fake-env). | `useBoot.ts` (new), `BootSequence.vue`, `types.ts`, `useTerminal.ts`, `eggs.ts` | S |
| [x] | fake `.env` | Joke env file in the fake filesystem. Full spec in [appendix](#appendix--reboot-and-fake-env). | `env-file.ts` (new), `files.ts`, `navigate.ts` | S |
| [x] | `whois <name>` | Joke registration record via `line`/`art`. Static, no infra. | `eggs.ts` | S |
| [x] | `weather` | Open-Meteo (no key, no account) module mirroring `steam`/`github` controller+service, cached 10 min; `conditionFor()` buckets WMO codes server-side so the glyph, the label and the background mood read one mapping. Frontend `useWeather.ts` + hand-drawn 11×5 glyphs in `weather-art.ts` (padded on read, no emoji — they render double-width and shear the column). Alias `wttr`. **Privacy:** coordinates come from server config and are Jules's, never the caller's — no geolocation, same answer for everyone, which is what makes one shared cache correct. Left empty in `.env.example` because the site says only "France". | `backend/src/weather/*` (new), `useWeather.ts` (new), `weather-art.ts` (new), `live.ts`, `lib/api.ts` | M |
| [x] | `ping <section>` | Fake latency lines via `terminal/timing.ts`'s `sleep()` + `ctx.frame()`, then the existing `navigate()`. | `navigate.ts` | S |
| [x] | `diff <a> <b>` | Reuse `resolveFileLines()` for both files, small pure line-diff util. | `terminal/diff.ts` (new) + command | S |
| [x] | `alias` | Session map persisted like `history.ts`; `registry.ts`'s `resolve()` checks it before `suggest()`. | `terminal/aliases.ts` (new), `registry.ts`, command | M |
| [x] | `env` / `export` | **Shares its data with the fake `.env` file** (one source module, two renderers) so they cannot drift. `printenv`-style output. | reuses `env-file.ts`, new command | S |
| [x] | `ssh couvbat@jhemery.xyz` | Joke "Connecting…" sequence; ends by calling `effects.reboot()` rather than inventing a second boot animation. | `eggs.ts` | S |
| [x] | `btc` / `stonks` | `GET /markets` proxies CoinGecko's public endpoint (no key, no account, like Open-Meteo), cached 5 min and only fetched when the command runs. The coin list is server config, never the request, so no caller data is forwarded. 168 hourly points downsampled to 48 server-side. `sparkline.ts` draws `▁▂▃▄▅▆▇█`; decimals follow the size of the number so 55 000 and 0.42 both read; a flat week draws flat instead of dividing by zero. **Departure from the plan:** "stonks" is an alias, not a second integration — every free stock API wants a key and an account, which is exactly what both live sources here were picked to avoid. | `backend/src/markets/*` (new), `terminal/sparkline.ts` (new), `live.ts`, `lib/api.ts` | M |
| [x] | `banner <text>` | Client-side only: embedded 5×7 block-letter font table, rendered through `art()`/`pre`. Font table is the only real work. | `terminal/ascii-banner.ts` (new) + command | M |
| [x] | Argument autocompletion | Optional `complete?(ctx): string[]` on the `Command` interface; `completeInput()` splits the line, works out which word the cursor is on and routes past the first word to the owning command — through an alias expansion, so `zz ab` completes against what `zz` runs. Sources: a shared `listFiles()` in `files.ts` (one source `ls`, `cat`, `vim` and `diff` all read) for filenames; `sectionIds` for `cd`/`ping`; alias names for `unalias`; `on`/`off` for `gravity`/`constellation`; visible command names for `help`; plus `open`, `lang`, `scene`, `ls -a`, `ssh`, `whois`. Alias names join the command-word candidates. Same `commonPrefix()` and print-when-ambiguous behaviour, one word later. **Departure from the plan:** a dotfile joins `listFiles()` only once its achievement is unlocked — `cat .`+Tab must not hand out `.secret`, same rule `suggest()` follows. | `types.ts`, `registry.ts`, `useTerminal.ts`, `files.ts`, `guestbook-fs.ts`, per-command `complete` in `navigate.ts`/`core.ts`/`eggs.ts`, `__tests__/completion.spec.ts` | M |

## C. Live information

Passive data cards — no achievements (see §D).

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Build/deploy status card | Reuses the **existing** `GITHUB_TOKEN` + `github.module` — one `GET /github/workflow-status` route on the Actions REST API. Cheapest live item. | `backend/src/github/*` (extend), frontend card | S–M |
| [x] | Visitor counter / presence | Nest's native `@Sse()`, no new dep. The connection *is* the subscription, so arriving pushes a new count to everyone and a closed tab is a plain unsubscribe — better than the planned periodic broadcast, since the number moves the moment someone comes or goes. 25s heartbeat so Apache doesn't reap the stream; count lives in memory. Payload is one integer: no visitor id sent or assigned, nothing written down, and a test asserts the payload has exactly one key. Shown in the footer status line; `usePresence.ts` gives up after 3 failed connections, and the segment stays out of the DOM until a first message arrives. | `backend/src/presence/*` (new), `usePresence.ts` (new), `SiteFooter.vue`, `messages.ts` | M |
| [x] | Uptime/status ticker | Extends `neofetch`'s "days since first commit" calc into a visible status line; "last deploy" reuses already-fetched GitHub activity. | small status composable | S |
| [x] | Weather-linked background mood | `useWeather.ts` maps the condition to a `{ speed, opacity }` pair `ThreeBackground` multiplies into what the section palette already decided — storm faster, fog dimmer, snow slower, night dimmer still. Opacity always scales from each shape's stored `baseOpacity`, so repeated changes cannot ratchet the scene to invisible. The single request is made by `ThreeBackground` on mount and `weather` reuses it; under reduced motion the component never mounts, so the call never happens. | `useWeather.ts`, `ThreeBackground.vue` | M |
| [x] | Live guestbook ticker | **Polling, not SSE**: `GET /guestbook` every ~20s, diff for new entries, surface through `AchievementToast.vue`'s existing pattern. No new backend. | poller composable + toast component | S–M |
| [x] | Global command counter | `POST /stats/session` from `primeOverlay()`, once per session — per-command would be chatter and would mean the server learning *which* commands run, the thing `ask` promises not to record. Stored as `{"sessions":N}` in one JSON file under `DATA_DIR` (excluded from the deploy, so it survives a release), write-then-rename like the guestbook, flushed at most every 30s. Rate-limited 5/hour per IP through the existing guard, because a number anyone can inflate with a `for` loop is not worth printing. Surfaced as a `Sessions` row in `neofetch`, omitted rather than zeroed when the backend is unreachable. | `backend/src/stats/*` (new), `useStats.ts` (new), `useTerminal.ts`, `content.ts` | S–M |

## D. Achievement tie-ins

Ship each **after** its parent feature lands — a follow-up, never a blocker. Mechanically each one
is `unlock('id')` + `announce('id', t)` inside the command's `run()` (see `matrix`/`vim` in
`eggs.ts`), plus one entry appended to `achievementList` in `terminal/achievements.ts`. Progress
counters already read `achievementList.length`, so the `n/21` display updates itself.
`completionist` stays last in the array and cascades over whatever the new total is.

Hints stay oblique in the modal — nudge, never name the command. The table below is the spoiler
version, for README's achievements table once shipped.

| ✔ | id | title (en / fr) | unlocks on | needs |
|---|---|---|---|---|
| [x] | `dotenv` | Configuration Leak / Fuite de config | `cat .env` or `vim .env` | fake `.env` |
| [x] | `reboot` | Deja Vu / Déjà-vu | running `reboot` | `reboot` |
| [x] | `diffsy` | Spot the Difference / Trouvez l'erreur | `diff` on two real files | `diff` |
| [x] | `alias` | Make It Yours / À votre façon | defining an alias | `alias` |
| [x] | `ssh` | Knock Knock / Toc toc | running the `ssh` joke | `ssh` |
| [x] | `banner` | Big Text Energy / Grosses lettres | running `banner <text>` | `banner` |
| [x] | `cyanSpotter` | Rare Find / Trouvaille rare | clicking one of the 3 cyan wireframes (of 18) | click-to-inspect |
| [x] | `constellation` | Connect the Dots / Relier les points | toggling constellation mode | constellation |
| [x] | `zeroG` | Zero-G | running `gravity off` | scene control |

## E. Games, vol. 2

Five more games in the output buffer. Added after the original three categories were complete, so
this section has its own build order below. Design lives in
[`superpowers/specs/2026-08-07-terminal-games-vol2-design.md`](superpowers/specs/2026-08-07-terminal-games-vol2-design.md)
— read it before picking up a row, the interesting decisions are there rather than here.

The premise: `2048` and `snake` paid for the infrastructure (`ctx.capture()`, `keyStream()`, the
pure-state/renderer split, the `harness()` in `games-command.spec.ts`), so the marginal cost of a
sixth game is the game. That is why five land at once rather than one per quarter.

**Shared prerequisites**, done once ahead of the games themselves:

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `Esc`/`Ctrl+C` as the universal quit | Already works — `onPanelKeydown` aborts on `Esc` during a capture and `handleCaptureKeydown` refuses modifiers. What changes is the documentation of it: `q` cannot be universal because three of the new games read letters. `messages.ts`'s `terminal.playing` prompt label names controls that are wrong for four of seven games and becomes control-agnostic; each game prints its own hint. | `i18n/messages.ts` | S |
| [x] | Score direction | Minesweeper's score is time, where lower wins, and `recordScore` is `Math.max`. The `KEYS` table becomes `{ key, better: 'higher' \| 'lower' }`. Rejected alternative: storing `1000 - seconds` to keep one direction — makes the stored number meaningless and the display a second piece of arithmetic. | `terminal/games/scores.ts` | S |
| [x] | Count-driven `games` | It hardcodes `two games` / `deux jeux` and prints 2048's control hint as if it were general. One table drives the listing, the count and the `GameId` rows. | `terminal/commands/games.ts` | S |

**The games**, each a pure state module + renderer + one vitest spec + one achievement:

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `minesweeper` | Turn-based, so no tick and no reduced-motion branch — build first, for the reason 2048 was built first. 16×10/25 mines at two chars per cell. **Mines are laid after the first reveal**, excluding it and its neighbours: losing on move one is a bug that looks like a difficulty. Cursor on arrows/`wasd`, `space` reveals, `f` flags. Flood-fill on the zero region is the only real logic. | `games/minesweeper.ts` (new), `commands/games.ts`, `__tests__/game-minesweeper.spec.ts` | M |
| [x] | `wordle` | The pick of the five: the only game that gets *better* from the site being bilingual — `ctx.locale` chooses the word list, accents folded on comparison so `EPEE` matches `ÉPÉE`. Turn-based. **Duplicate-letter scoring is the whole difficulty** (count the answer's letters, spend on exact hits first, then near-misses left-to-right) and gets its own tests. Used-letter row under the grid is most of what makes it playable. Word list goes in `games/words.ts`, *not* `content/` — see the spec for why. | `games/wordle.ts`, `games/words.ts` (new), `commands/games.ts`, `__tests__/game-wordle.spec.ts` | M |
| [x] | `hangman` | Nearly free once wordle lands — shares `games/words.ts`, so the marginal cost is gallows art and a guessed-letters set. Repeating a letter is refused without costing a life. Not worth building alone; obviously worth building second. | `games/hangman.ts` (new), `commands/games.ts`, `__tests__/game-hangman.spec.ts` | S |
| [x] | `wpm` | The best thematic fit and the cheapest: a typing test in a terminal is barely a game. Prompt text comes from `content/`, so you type a line of the actual résumé. No timer of its own — reads `Date.now()` per keystroke, nothing to tear down. A character typed wrong once stays counted against accuracy, which is the only way accuracy means anything. | `games/typing.ts` (new), `commands/games.ts`, `__tests__/game-typing.spec.ts` | S |
| [x] | `tetris` | **Reverses the "out of scope" call in the 2026-08-04 spec**, which cited rotation/kicks/gravity and "reads worse in a monospace grid". Gravity is now a copy of snake's tick loop; kicks are not SRS but "try in place, then one left, then one right, then refuse"; and the monospace objection is answered by drawing two characters per cell, which makes the well square. Seven 4×4 bitmask tables, four rotations each, precomputed. No speed curve. Reduced motion gets gravity-per-keypress rather than snake's step-per-keypress, because gravity *is* the game. Build last — it is the only one with a tick. | `games/tetris.ts` (new), `commands/games.ts`, `__tests__/game-tetris.spec.ts` | M–L |

### Achievements for E

Same rule as §D: ship each **after** its game, never as a blocker. Takes the list from 30 to 35;
`completionist` cascades over whatever the total is and every surface already reads
`achievementList.length`. Thresholds are single successes rather than scores wherever possible —
the skill-gate trade-off the first games spec flagged still holds, and 100% should stay a matter of
persistence rather than reflexes.

| ✔ | id | title (en / fr) | unlocks on | needs |
|---|---|---|---|---|
| [x] | `minesweeper` | Clean Sweep / Déminage | clearing a board | `minesweeper` |
| [x] | `wordle` | Word Play / Jeu de mots | solving a wordle | `wordle` |
| [x] | `hangman` | Last Word / Le mot de la fin | winning a round | `hangman` |
| [x] | `wpm` | Touch Typist / Dactylo | 60 wpm at ≥95% accuracy | `wpm` |
| [x] | `tetris` | Line Clear / Ligne complète | clearing 10 lines in one game | `tetris` |

---

## Build order

**Phase 1 — quick wins, no backend (S):** ✅ shipped on `feat/phase-1` → `dev`.
`reboot`, fake `.env`, `whois`, `ping`, `diff`, `env`/`export`, `ssh`, achievement-gated visual
unlock, glitch burst, section-reactive palette, pointer gravity well, uptime ticker — plus the four
achievements those unlocked (`dotenv`, `reboot`, `ssh`, `diffsy`).

**Phase 2 — contained modules, mostly frontend or one small route (M):** ✅ shipped on
`feat/phase-2` → `dev`.
click-to-inspect, scene control, constellation, `banner`, `alias`, build/deploy card, guestbook
ticker — plus the five achievements those unlocked (`alias`, `banner`, `cyanSpotter`,
`constellation`, `zeroG`).

**Phase 3 — the rest, one at a time (M–L):** ✅ all shipped, one branch each → `dev`.
`feat/phase-3-completion` (argument autocompletion — the only one that needed no backend, and it
makes every command already shipped easier to find), `feat/phase-3-weather` (`weather` +
weather-linked background mood), `feat/phase-3-markets` (`btc`/`stonks`),
`feat/phase-3-presence` (presence SSE), `feat/phase-3-stats` (command counter).

Every row in §A–D is ticked.

**Phase 4 — games, vol. 2 (§E):** in progress on `claude/game-ideas-ec3dc5` → `dev`.
The three shared prerequisites first (they touch code all five games read), then `minesweeper`,
`wordle`, `hangman`, `wpm`, `tetris` in that order — turn-based before word-based before ticked, so
each game reuses the one before it and `tetris`, the only one with a tick, lands last against a
suite that already covers everything else.

## Known issues

- **`registry.ts` ↔ `commands/index.ts` is a circular import.** Pre-dates all of this: the command
  modules import `resolve()` back from the registry, whose top-level code builds the lookup Map.
  A clean load is fine because the registry is entered first, but entering `commands/index.ts`
  first throws `Cannot access 'coreCommands' before initialization` — seen once in the dev server
  during an HMR reload. The fix is to build the Map lazily so nothing runs at import time.

## Dropped

- **Spotify now-playing** — SoundCloud is the only player in use.
- **Lichess "recently played"** — not a game Jules plays, so the card would sit empty.

---

## Appendix — `reboot` and fake `.env`

The two Phase-1 items that are fully specified and ready to implement first.

### `reboot`

Replays the full-screen boot sequence on demand, mirroring how `matrix`/`crt` trigger effects.

1. **`frontend/src/composables/useBoot.ts`** (new) — mirrors `useMatrix.ts`:
   ```ts
   const active = ref(false)
   export function triggerBoot() { active.value = true }
   export function ackBoot() { active.value = false }
   export function useBoot() {
     return { bootActive: computed(() => active.value), triggerBoot, ackBoot }
   }
   ```
2. **`BootSequence.vue`** — extract `onMounted`'s body (minus the `alreadyBooted` check) into a
   shared `start()`. `onMounted` keeps `if (alreadyBooted || prefersReducedMotion()) return` then
   calls `start()`. Add `watch(bootActive, (v) => { if (v) start() })` for the manual trigger — no
   `alreadyBooted` gate, a reboot always replays. `finish()` also calls `ackBoot()` so the flag
   resets and `reboot` is repeatable.
3. **`terminal/types.ts`** — add `reboot: () => void` to `TerminalEffects`.
4. **`useTerminal.ts`** — `reboot: triggerBoot` in the `effects` object, next to `matrix: showMatrix`.
5. **`eggs.ts`** — hidden command next to `matrix`:
   ```ts
   {
     name: 'reboot',
     description: { en: 'Replay the boot sequence', fr: 'Rejouer la séquence de démarrage' },
     group: 'fun',
     hidden: true,
     run({ effects, close }) {
       if (prefersReducedMotion()) {
         return [line('rebooting… (animation skipped: reduced motion)', 'primary')]
       }
       close()
       effects.reboot()
     },
   }
   ```
6. README.md + `features-spec.md` §6 note that the boot sequence is replayable.

### Fake `.env`

`cat .env` / `vim .env` (after `ls -a` reveals it) prints a joke environment file, following the
`.secret` template exactly.

1. **`terminal/commands/env-file.ts`** (new):
   ```ts
   export const ENV_FILE = '.env'

   export function envFileContents(t: <T>(value: Localised<T>) => T): OutputLine[] {
     return [
       line('# .env', 'muted'),
       pre('NODE_ENV=production'),
       pre('PORT=3000'),
       pre('DATABASE_URL=postgres://root:hunter2@localhost:5432/prod'),
       pre('JWT_SECRET=trust-me-bro'),
       pre('STRIPE_SECRET_KEY=sk_live_definitely_not_real'),
       pre('AWS_ACCESS_KEY_ID=AKIA_NICE_TRY'),
       pre('ADMIN_PASSWORD=correcthorsebatterystaple'),
       pre('COFFEE_LEVEL=critical', 'accent'),
       blank,
       line(t({ en: '# nice try.', fr: '# sympa d’avoir essayé.' }), 'muted'),
     ]
   }
   ```
   Content is worth eyeballing before it ships — this is the joke. Values stay unlocalised (fake
   tech strings, same reasoning `hardware.ts` specs are); only the closing comment is bilingual.
   Uses `pre()` from `format.ts`, not `line()`, so the `KEY=value` rows keep alignment.
2. **`terminal/commands/files.ts`** — `case ENV_FILE:` in `resolveFileLines()`, next to
   `SECRET_FILE`. `vim` already calls `resolveFileLines()`, so `.env` opens there for free.
3. **`terminal/commands/navigate.ts`** — add `.env` to the `hidden` array in `ls -a`.
4. README.md — mention `.env` alongside `.secret`.
5. Small vitest case asserting `.env` resolves through `resolveFileLines()`.
