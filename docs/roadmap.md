# Roadmap — brainstormed features

Status tracker for the feature brainstorm: first three categories (three.js background, terminal
commands, live information), then games vol. 2 (§E), views and tools (§F), the September 2026
batch (§G) and the late-September brainstorm (§H). Built feature by feature, across sessions.

**Current state: §A–§G are shipped; §H is proposed and not started.** Anything else still open is
under [Open](#open) and [Known issues](#known-issues).

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
counters already read `achievementList.length`, so the `n/total` display updates itself.
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

### Follow-up — real word lists

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Generated word lists | The hand-written lists shipped with §E were its weakest part: ~440 answers per locale, no frequency data, and in French no way to tell a headword from a conjugation, so `ABOYA` sat next to `TABLE`. Replaced by `scripts/build-wordlists.mjs` (run by hand, output committed). **Permissive sources only** — SCOWL/MIT for English, and for French an MIT word array ∩ a hunspell lemma set (MPL-2.0) ranked by Tatoeba frequency (CC BY 2.0 FR). Rejected: Lexique383 and `hermitdave/FrequencyWords` (CC BY-**SA**), Monkeytype (GPLv3), `google-10000-english` (LDC, non-commercial), Leipzig (licence stated inconsistently). Full reasoning in the spec addendum. | `scripts/build-wordlists.mjs` (new), `games/data/*` (generated), `games/words.ts`, README attribution | M |
| [x] | Lazy word-list chunks | ~60 kB gzipped is a third of the page budget, paid at first paint by the majority who never open the terminal. Behind `import()`, one chunk per locale, excluded from the PWA precache with a runtime rule — the `ThreeBackground` treatment. Knock-on: `newGame` takes its words as an argument, so the state modules stay pure and the specs use fixtures. | `games/words.ts`, `games/{wordle,hangman,typing}.ts`, `commands/games/*`, `vite.config.ts` | S–M |
| [x] | `wpm` types random words | Was prose from `content/`, which was charming and measured the wrong thing — a sentence lets you predict what comes next and coast, scoring reading as much as typing. Twelve common words a line, drawn with replacement. | `games/typing.ts`, `commands/games/wpm.ts` | S |

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

## F. Views and tools

A second page, the transition between pages, and the utilities on it. Design in
[`superpowers/specs/2026-09-22-tools-and-views-design.md`](superpowers/specs/2026-09-22-tools-and-views-design.md),
slices in [`superpowers/plans/2026-09-22-tools-and-views.md`](superpowers/plans/2026-09-22-tools-and-views.md).

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `views.ts` + `goTo` | The route list as content, one level above sections; one navigation function the navbar, palette and terminal all use; `cd`/`ls`/`pwd`/`ping` learn paths. | `content/views.ts`, `useViewSwing.ts`, `navigate.ts`, `NavBar.vue`, `CommandPalette.vue` | M |
| [x] | Prism swing | Pages as faces of a prism (CSS 3D on a fixed, clipped stage), the wireframe *field* yawed in a `THREE.Group` by the same eased clock, re-homed on the first frame and baked on the last. Reduced motion: instant swap. | `useViewSwing.ts`, `App.vue`, `main.css`, `ThreeBackground.vue` | M |
| [x] | `/tools` + registry | `tools/registry.ts` drives the page, the `tools` command, `ls tools`, `cd tools/<id>` and Tab. One lazy chunk per panel. | `views/ToolsView.vue`, `tools/*` | M |
| [x] | Client tools, vol. 1 | `image` (canvas re-encode, strips EXIF), `hash` (Web Crypto), `encode` (base64/url/hex), `json` (format/minify with a scanner that points at the error). | `tools/{image,hash,encode,json}/` | M |
| [x] | Client tools, vol. 2 | `colour`, `time`, `password` (diceware from the games' word lists), `text`. Pure additions to the registry. | `tools/*` | S each |
| [x] | `ffmpeg.wasm` tier | The accepted dependency exception. Single-thread core served from our own `/assets/` (CSP stays `'self'`, plus `'wasm-unsafe-eval'`), fetched only on an explicit "download 32 MB" button, loader and worker kept out of the precache like three.js, input read in place over WORKERFS, ffprobe for the stream facts. COOP/COEP for the multi-thread core deliberately not done: it would break the SoundCloud embed on the same document. | `tools/ffmpeg/`, `vite.config.ts`, `.htaccess`, `third-party.ts` | M |
| [x] | Rooms (`watch`, `radio`) | SSE + POST, in-memory with a two-hour idle TTL and a cap of 200, `ROOMS_ENABLED` off by default, media allowlisted server-side. Both embeds driven over `postMessage` — no YouTube or SoundCloud script on the page, one `frame-src` added. Third and fourth faces of the prism; `cd watch/<code>` joins. | `backend/src/rooms/*`, `frontend/src/rooms/*`, `views/{Watch,Radio}View.vue` | L |
| [x] | Downloader (admin) | The shell check said the box can run it, so it does: a **job** API (start / poll / fetch-once), yt-dlp spawned with the check's findings as defaults, URLs allowlisted to one video or one track, `AdminGuard` on every route, `DOWNLOADER_ENABLED` off by default. Unlocked by `sudo -i`; hidden from every listing until then. | `backend/src/jobs/*`, `backend/src/common/admin.guard.ts`, `frontend/src/lib/admin.ts`, `tools/download/` | L |

## G. September 2026 batch

Brainstormed on 2026-09-24, after §F shipped. The playground is large by now, so about half of
this batch is about the *portfolio* rather than the toys: what the site says about the work, and
how visitors find their way in. All shipped together in #98, on `claude/roadmap-features-impl-c80870`,
one commit per group below. The decisions the approach column left open are recorded in
[`superpowers/specs/2026-09-24-september-batch-design.md`](superpowers/specs/2026-09-24-september-batch-design.md).

### Portfolio content

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Availability line | `profile.ts` gains `availability: { open: boolean, note: Localised }`. One fact, three readers: a `Status` row in `neofetch`, the footer status line and the résumé plugin. It stays plain content, so `purity.spec.ts` covers it for free. | `content/profile.ts`, `content/types.ts`, `commands/content.ts`, `SiteFooter.vue`, `vite-plugins/resume.ts` | S |
| [x] | Skills with evidence | `skills.ts` goes from a list of names to `{ name, usedIn?: { what: Localised, where: string }[] }`, where `where` is a path `goTo()` already accepts (`tools/ffmpeg`, `watch`) or a repo URL. The hero renders the links, `skills --why` prints them, and the résumé keeps the plain names. Only claim what the repo can show: SSE → presence and rooms, WebAssembly → ffmpeg, GraphQL → the heatmap. | `content/skills.ts`, `content/types.ts`, `HeroSection.vue`, `commands/content.ts`, `vite-plugins/resume.ts` | S |
| [x] | Printable résumé | `vite-plugins/resume.ts` also emits `/resume.html` from the same content, beside `resume.txt`: static markup with a print stylesheet, no JS and no SPA, so "Save as PDF" gives a clean CV and crawlers get real HTML. The stylesheet is its own file, so the CSP needs nothing new. Added to `navigateFallbackDenylist`, linked from the contact section and from `resume`. No PDF library. | `vite-plugins/resume.ts`, `vite.config.ts`, `ContactSection.vue`, `commands/content.ts` | S |
| [x] | `/now` page | `content/now.ts` holds a dated list (`updated: 'YYYY-MM-DD'`, then building / playing / learning), readable as `cat now.txt` and at `/now`. Once it is more than 90 days old the page says how old it is instead of pretending otherwise, which is the only honest way a /now page survives neglect. Open question: a fifth prism face costs navbar room (#87 was nine destinations overflowing), so it may be a route outside the prism. | `content/now.ts` (new), `content/views.ts` or the router, `views/NowView.vue` (new), `commands/files.ts` | S |

### Hidden layer

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | CTF flag chain | Built as designed in [the spec](superpowers/specs/2026-08-04-ctf-flag-chain-design.md): eight stages across surfaces that already exist, ending in a `decrypt` finale keyed by the seven earlier flags. Its i18n and out-of-scope sections still apply. | see the spec | M |

### Terminal

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `systemctl status` | `GET /health` collects each module's existing `configured`/enabled state and cache age into one list. It adds no probes of its own and only reads what the services already know, so it never calls Steam or the model on a visitor's behalf. Rendered as unit status: `● steam.service active (running)`, `○ ask.service inactive (dead): the model is asleep`, and `systemctl status <unit>` for one. With the API down every unit reads `unknown`, which is the true answer. | `backend/src/health/*` (new), `backend/src/common/health.ts` (new), a `health()` on each service, `app.module.ts`, `lib/api.ts`, `commands/systemctl.ts` (new) | S–M |
| [x] | Links that run a command | `?run=<command>` opens the shell, runs the command once and drops the parameter from the URL. Opt-in per command through `linkable?: boolean` on `Command`, beside `hidden` and `palette`, so the registry stays the API. A `registry.spec.ts` invariant stops anything that writes (`mail`, `sign`, `sudo`, `alias`) from ever being flagged. Desktop only, like the terminal: on mobile the parameter is ignored and the page loads normally. | `terminal/types.ts`, `registry.ts` (`resolveLink`), `useRunLink.ts` (new), `useTerminalShell.ts`, `useTerminal.ts`, `App.vue`, `__tests__/registry.spec.ts` | S |
| [x] | Daily wordle + share | `wordle daily` picks the answer by hashing the UTC date into the locale's list, so everyone gets the same word per language, and one play per day is remembered beside the scores. `wordle share` copies the finished grid. Emoji go only to the clipboard, never into the buffer, where they render double-width (the reason `weather-art.ts` has none). Optional follow-up: an anonymous guess-count histogram, `POST /stats/wordle` with `{ day, guesses }` and nothing else, rate-limited like `/stats/session`. | `terminal/games/wordle.ts`, `commands/games/wordle.ts`, `terminal/games/scores.ts`, `tools/clipboard.ts`; follow-up `backend/src/stats/*` | S (+M) |
| [x] | Shell versions of the tools | `sha256sum`, `base64 [-d]`, `uuidgen` (`crypto.randomUUID`) and a pretty-print-only `jq .`, each importing the pure `.ts` next to its tool panel. The shell and the page then can't disagree, the same rule `cat` and `vim` follow. | `commands/tools.ts`, `tools/{hash,encode,json}/*.ts` | S each |
| [x] | Prompt suggestions | While the prompt is empty, faded placeholder text cycles through a few visible commands (`try: neofetch`) every few seconds, and stops for the session after the first keystroke. Drawn from the registry, never from hidden commands. Under reduced motion it shows one static hint. | `composables/usePromptSuggestion.ts` (new), `registry.ts` (`suggestionPool`), `components/terminal/TerminalOverlay.vue` | S |

### Tools, vol. 3

Each one is a folder and a registry entry, with its logic in a plain `.ts` and its own spec, like
the rest of §F.

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | `jwt` | Decodes the header and payload, shows `exp`/`iat` as dates with a relative phrase (reusing `tools/time/time.ts`) and flags expired tokens. Decode only: verifying would mean pasting a secret into a web page, which the tool shouldn't encourage. | `tools/jwt/` (new), `tools/registry.ts` | S |
| [x] | `regex` | Pattern, flags and test text, with matches and groups highlighted. It runs in a Worker with a timeout, because a catastrophic-backtracking pattern would otherwise freeze the tab. JavaScript flavour, and the panel says so. | `tools/regex/` (new), `tools/registry.ts` | S–M |
| [x] | `cron` | Turns a five-field expression into a sentence in both languages ("every weekday at 09:00") and lists the next five runs in the visitor's time zone. Own parser, covering ranges, steps, lists and names. | `tools/cron/` (new), `tools/registry.ts` | S |
| [x] | `qr` | Text or URL to a QR code, downloadable as PNG and SVG. The encoder (Reed–Solomon, masking) is the only real work: hand-written, or a small MIT encoder inside the tool's own chunk. `ffmpeg` is the only dependency exception so far, so that choice belongs in the design. | `tools/qr/` (new), `tools/registry.ts` | S–M |
| [x] | `diff` | Two text areas and a unified diff, using the same `terminal/diff.ts` the `diff` command does. | `tools/diff/` (new), `tools/registry.ts`, `terminal/diff.ts` | S |

### Background and visuals

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Presence in the scene | `usePresence`'s count minus one (you) adds that many wireframes through `useSceneControl`, capped well under the 60-shape limit so a busy day can't bury the scene; they fade out as people leave. Nothing new goes over the wire: it's the same integer the footer already shows. | `usePresence.ts`, `useSceneControl.ts`, `ThreeBackground.vue` | S |
| [x] | Screensaver | After a few idle minutes with the tab visible, the page fades and the wireframe field takes the whole screen; any key or pointer move wakes it. It never starts while a game holds the keyboard or a room is playing. Reduced motion needs no branch, because `ThreeBackground` never mounts there. | `composables/useIdle.ts` (new), `App.vue`, `ThreeBackground.vue` | S–M |

### Shared and AI

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Two-player games | Connect four or battleship over a five-character room code. Rooms trust only the host token today, so a game room issues a second seat token on first join and the server enforces turn order. The rules stay in a pure frontend module, like every other game. Same caps, TTL and `ROOMS_ENABLED` switch as watch and radio. | `backend/src/rooms/*`, `frontend/src/rooms/*`, `terminal/games/connect4.ts` (new), `commands/games/connect4.ts` (new) | L |
| [x] | MCP server | A read-only MCP endpoint exposing the résumé, projects and skills, with nothing that writes, so an agent can be pointed at the API and asked about Jules. The content lives in the frontend build, so a Vite plugin emits `content.json` beside `resume.txt`, and the backend fetches it from `FRONTEND_URL` and caches it; the two apps stay independent. Off by default (`MCP_ENABLED`), limited per IP by the existing guard, and nothing logged, same as `ask`. | `vite-plugins/resume.ts`, `backend/src/mcp/*` (new), `backend/.env.example` | M |

### Departures from the approach column

- **`/now`** is a route outside the prism, which settles the open question: `views.ts` keeps four
  faces and the navbar gains nothing. It is linked from the footer and from `cat now.txt`.
- **Printable résumé** ships in both languages, `resume.html` and `resume.fr.html`, from one builder.
- **Skills with evidence** adds SSE, WebAssembly, GraphQL and three.js, each backed by a link, and
  keeps `skillNames` as the plain list for every reader that only wants names.
- **CTF chain:** progress stores the flag values, not only the stage ids — the board shows them and
  `decrypt` rebuilds its key from them. `decrypt` solves stage 8 itself. The optional `ask`
  hand-off in the spec is not built; the chain stands alone through `llms.txt`, as the spec
  required.
- **`?run=` links:** the games are linkable (they write nothing until played); `connect4` is not,
  since it creates a room or claims a seat. Links never expand the reader's aliases.
- **Shell tools** also answer to `sha1sum` and `sha512sum`, picking the algorithm from the name typed.
- **Daily wordle** shipped with its histogram follow-up (`POST /stats/wordle`), and saves the
  board after every guess so a closed tab resumes rather than restarts.
- **`qr`** is hand-written, byte mode only; `ffmpeg` stays the only dependency exception.
- **MCP** is hand-written rather than the SDK: stateless JSON over Streamable HTTP, with nothing
  the SDK's sessions and streams would be used for. Five tools, six resources.
- **Two-player games:** connect four, not battleship — battleship has hidden state the server
  would have to hold to keep a player honest.
- Found while building `qr`: the CSP's `img-src` had no `blob:`, so the image tool's previews
  were blocked in production. Fixed separately in #97, whose production-CSP e2e spec now covers
  the `regex` worker and the `qr` preview as well.

## H. Late-September 2026 brainstorm

Brainstormed on 2026-09-25, after #102 marked availability as closed. The site no longer has to
sell anyone on hiring Jules, so this batch leans towards showing the work and proving what the
site claims rather than adding toys; §G already called the playground large. Six lenses proposed
54 ideas, and three reviews (does it already exist, does it fit the site's principles, is it worth
the effort) cut them to the rows below. What was cut, and why, is under [Dropped](#dropped).
Nothing here is built yet.

### Fixes found on the way

Existing problems, not features, and the first thing to do: several rows further down lean on
them.

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | Rate-limit key | `clientIp()` keys on the leftmost `X-Forwarded-For` entry, which is the one the client writes; Cloudflare and Apache append theirs after it. Key on `CF-Connecting-IP` when present, else on `req.ip` with the trust-proxy hop count that matches Cloudflare → Apache, and cap the size of the `hits` Map. The spec that matters: a client-sent `X-Forwarded-For` must not open a new bucket. `who`/`wall` below waits for this. | `backend/src/common/rate-limit.guard.ts`, `backend/src/main.ts`, a guard spec (new) | S |
| [ ] | Re-seal the CTF payoff | `PAYOFF` still says "Hiring, a project…" while `availability.open` is false. Re-running the seal changes only `SEALED`, so `STAGE_HASHES` and everyone's stored flags survive. | `frontend/scripts/ctf-seal.mjs`, `terminal/ctf.ts` | S |
| [ ] | `ask` reads its own origin | `CORPUS_URL` is hard-coded to production's `llms.txt`, so local and staging `ask` answer from production's corpus. Read `${FRONTEND_URL}/llms.txt`, as MCP already does. Its comment also calls the file generated; it's hand-written (see *generated llms.txt* below). | `backend/src/ask/ask.service.ts` | S |
| [ ] | Experience as content | The `resume` command hard-codes an experience block, and "2 years" is typed in three places, so `resume.txt`, both printable résumés and `content.json` have no experience section: the README's "one source for the CV" no longer holds. `content/experience.ts` holds dated `Role`s with a pure `durationLabel()` beside `daysSince`, every renderer reads it, and a résumé spec asserts they list the same roles in the same order. `content.json` gaining `experience` is a shape change, so it needs a new `version` and the matching backend change, deployed together. | `content/experience.ts` (new), `commands/content.ts`, `content/profile.ts`, `content/projects.ts`, `vite-plugins/resume.ts`, `backend/src/mcp/*` | S |
| [ ] | Accessibility gate at 1.00 | Clear the two failures `lighthouserc.yml` lists. Muted text measures 4.04:1: derive muted in `themeTokens()` by stepping OKLCH lightness until it clears 4.5:1 against background *and* surface, so all eleven schemes pass by construction, and raise `themes.spec`'s muted floor from 3:1 to match. The language toggle shows `FR` under a label that says something else: show `EN · FR`, with `lang` on each. Then `categories:accessibility` goes to 1, as SEO already is. | `lib/themes.ts`, `assets/main.css`, `lib/__tests__/themes.spec.ts`, `components/NavBar.vue`, `lighthouserc.yml` | S |
| [ ] | Lazy registry + cycle guard | Clears the [Known issue](#known-issues): `byName` is built on first use, so nothing runs at import time and either module can load first. A dependency-free spec walks the static imports and fails on any cycle not on an allowlist (shadcn's `ui/button` and `ui/badge` pairs are the two others today). A test reproduces the HMR failure with `vi.resetModules()`. | `terminal/registry.ts`, `src/__tests__/import-cycles.spec.ts` (new) | S |
| [ ] | Generated `llms.txt` and sitemap | `llms.txt` names four of the fourteen public tools and leaves out `/now` and the printable résumés; `sitemap.xml` has no `/tools/<id>`. First a spec that fails when a public tool or route is missing from either, and a hand update (S). Generating them from content comes later, once something else pays for splitting a pure `content/tools.ts` off `tools/registry.ts` (whose `load` keeps it out of `content/`). CTF stage 7's note for agents stays verbatim. | `public/llms.txt`, `public/sitemap.xml`, a content spec; later `content/tools.ts` (new), `vite-plugins/resume.ts` | S (+M) |

### Show the work

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | Case studies of the site's own parts | The one portfolio card, whose blurb still reads "shadcn-vue and a cyberpunk terminal aesthetic", opens into eight to ten short studies: the modal vim, the ISO 18004 QR encoder, room sync, the ffmpeg.wasm tier, the prism swing, MCP, presence, and the word-list licensing. `content/work.ts` holds `WorkPart { id, name, summary, hard, numbers, try?, code, spec?, decisions? }`, and every surface reads that one array. `try` is a `goTo()` path or a command line, and a spec asserts every command-form `try` resolves through `resolveLink()`, so *try it* is an ordinary `?run=` link. Code and spec links are pinned to `__BUILD_SHA__`, not `tree/master`. Surfaces: a grid under the portfolio card, a lazy `/work/:id` route outside the prism like `/now`, `ls projects` and `cat`, and `projects <id>`. Most of the cost is writing, about 150 bilingual words a part; wherever a number can come from the build, it should, because typed ones go stale. | `content/work.ts` (new), `sections/ProjectsSection.vue`, `router/index.ts`, `views/WorkView.vue` (new), `commands/content.ts`, `commands/navigate.ts`, `commands/files.ts` | M |
| [ ] | `why <topic>` | `why battleship`, `why polling`, `why mcp-sdk`: what was chosen, what was rejected and why, the PR, and an honest `hindsight` (the registry cycle is a good first one). `why` alone lists them. `content/decisions.ts` is seeded from the ~15 "Rejected alternative" lines already in the specs, and shares its `Decision` type with the case studies. Keep each `because` to one sentence and always link the spec's anchor, so the spec stays the authority and the two can't drift far. `complete()` offers ids; "did you mean" comes from exporting the registry's `editDistance`. Linkable. | `content/decisions.ts` (new), `commands/work.ts` (new), `terminal/registry.ts` | S |
| [ ] | `tour` | A linkable walk of about a minute through `ctx.run`: `neofetch`, a colour scheme shown but not saved, one game, `vim`, the `curl` hint, and the achievements count. With this much on the site, finding things is the bottleneck, not the number of them, and `?run=tour` is the one link to put in a bio. It may only run what a link could run itself, which `effects` below makes checkable. | `commands/work.ts` | S |
| [ ] | Design specs as pages | `docs/superpowers/specs` as static, script-free pages at `/notes/<slug>`, built like `resume.html`, in English with a line saying so. They are the best evidence of how the site was thought through, and today they are only on GitHub; the case studies' *read the design* links point here. Needs markdown to HTML at build time: write a small one or take a dependency, and say which in the design. | `vite-plugins/notes.ts` (new), `vite.config.ts` (`navigateFallbackDenylist`) | M |

### Prove the claims

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | `strace` and a real `curl` | `strace <cmd>` lists every request the command made (`GET /weather = 200 · 1.1 kB · 84 ms`) and the shape of each JSON body, never its values: `strace wordle daily` shows `{ day, locale, guesses }` and nothing else, and `strace ls` shows nothing at all. One observer set in `lib/api.ts`, a no-op when empty, fed by `request()`, `askStream()` and `usePresence`'s EventSource, subscribed for exactly the inner command's lifetime. `curl` becomes a same-origin GET/HEAD client: `-I` prints the real response headers (CSP, HSTS) with `cache: 'no-store'` so the service worker can't answer, and bare `curl jhemery.xyz` fetches the real `resume.txt` through an SGR-to-tone parser that drops concealed runs, so CTF stage 3 still needs a real terminal. Other hosts get "Could not resolve host". | `lib/api.ts`, `composables/usePresence.ts`, `commands/system.ts`, `commands/content.ts` | S |
| [ ] | Image metadata inspector | Before re-encoding, `image` lists what the file gives away: camera and serial number, lens, software, timestamps, GPS as decimal degrees ("this says where you stood"). Afterwards it parses its own output with the same parser and shows "0 fields — verified", which turns "strips by construction" into a check a browser change would fail on screen. A bounds-checked `DataView` walker written from TIFF 6.0 and CIPA DC-008, over JPEG APP1, PNG chunks and WebP RIFF, reading only the first 256 kB; a spec slices a fixture at every offset and expects a partial result, never a throw. `createImageBitmap` gets `imageOrientation: 'from-image'` explicitly, with an Orientation=6 fixture, so stripping never leaves a phone photo sideways. | `tools/image/metadata.ts` (new), `tools/image/ImageTool.vue`, `tools/__tests__/image.spec.ts` | S |

### Rooms

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | Queue as a sidebar | The queue exists (50 items, visible to guests) but sits under the host's controls, listed by raw video id or track path, so nobody can see what's coming. On wide screens the room becomes two columns, the player and an *up next* sidebar with the current item on top and the queue numbered under it; on a phone the sidebar stacks under the player. The host removes and reorders from the sidebar, and "next" moves there too; guests read it. Reordering needs no backend: a queue update already replaces the whole array. | `rooms/RoomPage.vue`, `i18n/messages.ts` | S |
| [ ] | YouTube in radio | A YouTube id (eleven characters) and a SoundCloud item (an https URL) can't be mistaken for each other, so the queue stays `string[]`. `validMedia()` accepts either for `radio` (watch stays YouTube-only), `parseMedia()` tries both, and the page picks the player per *item* rather than per room. The sync logic already drives both through one `PlayerHandle` and both emit `finished`, so a mixed queue hands over between them with no new sync code. YouTube's embed terms don't allow hiding the video to keep the audio, so a YouTube item in radio plays in a small but visible player. What keeps the two rooms distinct: watch is a big video player, radio a mixed playlist. | `backend/src/rooms/rooms.service.ts`, `rooms/sync.ts`, `rooms/RoomPage.vue`, `i18n/messages.ts` | S–M |
| [ ] | Titles in the queue (follow-up) | "Artist — Track" instead of an id. The backend resolves a title once, when the host adds the item, through YouTube's and SoundCloud's oEmbed endpoints, and keeps it beside the item. Fetching from the browser would mean widening `connect-src`, which is the reason not to. The queue becomes `{ media, title? }[]`, a change to the shape both apps read, so they deploy together; a failed lookup keeps the id, never blocks the add. | `backend/src/rooms/*`, `lib/api.ts`, `rooms/RoomPage.vue` | M |

### The shell, deeper

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | `effects` on `Command` | A required `effects: 'none' \| 'local' \| 'server'` replaces the hand-kept list of commands that write. Every "may this run without the visitor typing it?" rule then derives from one field: `linkable`, `tour`, pipeline and chain stages, and bang expansion. Build before those rows; each would otherwise make its own judgement, and a hand-kept list is where the next writer slips through. | `terminal/types.ts`, every `commands/*.ts`, `__tests__/registry.spec.ts` | S |
| [ ] | The shell over curl | `curl jhemery.xyz/neofetch`, `curl jhemery.xyz/projects` and `curl -H 'Accept-Language: fr' jhemery.xyz/about` print the read-only commands, in colour, in a real terminal; `curl jhemery.xyz/help` lists which answer. It works because output is `OutputLine[]` and never HTML. A pure `terminal/ansi.ts` maps tones to SGR codes from a palette shared with the résumé plugin, and links to OSC 8. The files are generated by a vitest spec, not the build: every linkable, non-live, non-game command runs through `recordingContext` in both locales into `toMatchFileSnapshot('public/run/<locale>/<name>.txt')`, so command code never runs inside `vite.config.ts` and CI fails on a stale file. Clock-dependent rows are left out. `.htaccess` rewrites `/<name>` for curl, wget and httpie only, with `Vary: User-Agent, Accept-Language`. | `terminal/ansi.ts` (new), `vite-plugins/resume.ts`, `public/run/**` (generated), `public/.htaccess`, `vite.config.ts` | M |
| [ ] | Pipes, `;` and `&&` | Reverses [features-spec §10](features-spec.md): `fortune \| cowsay`, `history \| grep theme`, `cat about.txt \| sha256sum`, `projects --json \| jq .`, and `LANG=fr neofetch`. The pipe carries `OutputLine[]`, not bytes, so colour survives and the no-HTML rule holds end to end; `cat f \| sha256sum` matches `sha256sum f` through the existing `fileText()`. `CommandContext` gains exactly `stdin?` and `tty`; a non-final stage prints into a collector and its `capture`/`prompt` throw "not a tty". A quote-aware tokeniser replaces `split(/\s+/)`, **treating quotes as grouping only when they balance**, because French elisions (`sign c'est top`, `ask qu'est-ce que…`) must not open a quote; specs pin those. It must keep the multi-word aliases (`ps aux`, `git log`). A chain or pipe is linkable only if every stage is. | `composables/useTerminal.ts`, `terminal/types.ts`, `commands/text.ts` (new: grep, head, tail, wc, sort, uniq), `terminal/registry.ts` | M |
| [ ] | `man` pages and `jules(1)` | `man ls` opens a real page (NAME, SYNOPSIS, OPTIONS, EXAMPLES, SEE ALSO) in a `less`-style pager with `/search`; every command answers `--help`; `-<Tab>` completes flags with their descriptions. `Command` gains an optional `manual`, and a generator fills one in from `usage`, `description` and `aliases`, so every command has a page on day one. SEE ALSO carries oblique hints (`ls(1)` → `sl(6)`). `man jules` is the résumé as a man page, and the plugin emits `/jules.1` and `/jules.fr.1` as real roff, so `curl -s jhemery.xyz/jules.1 \| man -l -` works. From a link, `man` refuses a hidden command's page, and `--help` matches exactly so `projects --json` is untouched. | `terminal/types.ts`, `terminal/pager.ts` (new), `commands/core.ts`, `composables/useTerminal.ts`, `vite-plugins/resume.ts`, `vite.config.ts`, `public/.htaccess` | M |
| [ ] | History like a shell | Ctrl+R reverse search as a mode of the input, `!!`, `!$`, `!42`, `^cta^cat`, ↑ as a prefix search when there's text, and fish-style greyed suggestions drawn only from the visitor's own history. Expansion runs in `run()` before aliases; `runLink()` never goes through `run()`, so `?run=!!` can't replay anyone's history. **Never expand in the arguments of anything whose text leaves the browser** (`sign`, `mail`, `ask`): otherwise `sign Great site!!` posts the previous command to the guestbook. | `composables/useTerminal.ts`, `terminal/history.ts`, `components/terminal/TerminalOverlay.vue` | S |

### Craft and polish

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [ ] | `acid` | A 16-step TB-303-style sequencer on `/tools` in plain Web Audio: saw or square into a resonant low-pass, accent, slide and drive, a tempo that reaches hardcore speeds, and "randomise in phrygian". The link is the save file: the pattern packs to about 30 bytes behind a version byte into `?p=`, decoded defensively (every field clamped). One persistent oscillator → `BiquadFilter` (resonance capped short of self-oscillation) → `tanh` shaper → gain, a lookahead scheduler against `AudioContext.currentTime`, master at −12 dB into a limiter, nothing sounds without a gesture. `acid <code>` plays it from the shell and is **not** linkable: a link that starts sound is hostile. If the site ever gets more sound, it starts from this engine. | `tools/acid/` (new), `tools/registry.ts`, `commands/tools.ts` | M |
| [ ] | Scheme forge and export | `theme forge #d65d0e` (or *make one* in the 🎨 menu) grows a twelve-colour scheme in OKLCH around one seed, then steps lightness until it passes the floors every shipped scheme is held to, reporting any it can't meet. The floors move from `themes.spec.ts` into `lib/themeRules.ts` so the test and the forge share one rule; colours go through `toHex`, so typed input never reaches a style attribute verbatim. A forged scheme is one extra theme, `custom`, restored before mount. `theme export alacritty\|kitty\|base16` prints the scheme on screen as a config for a real terminal; start with those three. | `lib/themeRules.ts` (new), `lib/forge.ts` (new), `lib/themes.ts`, `composables/useTheme.ts`, `commands/theme.ts`, `components/ThemeMenu.vue` | M |
| [ ] | Theme transitions | A new scheme spreads in a circle from the swatch clicked (`document.startViewTransition`, a clip-path on `::view-transition-new(root)`, ~450 ms; skipped for dark → light so the Flashbang plays as today), and the wireframes ease to their new colour with a preallocated lerp. Fixes three things that ignore the scheme: `MatrixRain.vue`'s hard-coded greens and English-only hint, the `.crt-overdrive` fringe, and the SoundCloud colour baked into `content/music.ts`. | `composables/useTheme.ts`, `components/ThreeBackground.vue`, `components/effects/MatrixRain.vue`, `assets/main.css`, `content/music.ts`, `sections/MusicSection.vue` | S |
| [ ] | Motion control | *Full · calm · paused* in the 🎨 menu and a `motion` command, persisted as `couvbat:motion`. Today only the OS setting stops the field (WCAG 2.2.2). The OS setting is a floor the row can't lift. Decorative surfaces read a `decorativeMotion()` (field, confetti, glitch, boot replay, prompt cycling, swing), while the games keep reading `prefersReducedMotion()`. Also a frame governor: 60 fps at most, 30 while the terminal's blurred panel is open. Not linkable, since it writes a setting. | `composables/useMotion.ts` (new), `components/ThemeMenu.vue`, `components/ThreeBackground.vue`, the effect components | S |
| [ ] | Accessible page changes | After the prism swing settles, focus the new view's `<h1 tabindex="-1">` and announce its `tabTitle()` in one `role="status"` node; the leaving face is `inert` for the swing (two `<main>`s overlap today); a skip link comes first. Tested in e2e, because focus after a real transition is what jsdom can't see. | `App.vue`, `composables/useViewSwing.ts`, `composables/useTabTitle.ts`, `e2e/navigation.spec.ts` | M |
| [ ] | `who` and `wall` | `who` lists everyone on the site as anonymous ttys (`somebody pts/3`). `wall` sends a wave with no content: every other visitor's wireframes ripple outward, and an open terminal prints "Broadcast message from somebody@jhemery.xyz". Rides the existing presence stream, so no new connection; the server coalesces waves to one per 3 s. No text, no id, and the count is the one already sent. After the rate-limit fix. | `backend/src/presence/*`, `composables/usePresence.ts`, `components/ThreeBackground.vue`, `commands/system.ts` | S |

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

**Phase 4 — games, vol. 2 (§E):** ✅ shipped on `claude/game-ideas-ec3dc5` → `dev` (#59, #60).
The three shared prerequisites first (they touch code all five games read), then `minesweeper`,
`wordle`, `hangman`, `wpm`, `tetris` in that order — turn-based before word-based before ticked, so
each game reused the one before it and `tetris`, the only one with a tick, landed last against a
suite that already covered everything else.

**Phase 5 — views and tools (§F):** ✅ all five slices shipped, one branch each → `dev`:
`feat/tools-and-views` (#78), `feat/tools-client-vol2` (#80), `feat/tools-ffmpeg` (#81),
`feat/rooms` (#82), `feat/downloader` (#83). Follow-up fixes: navbar overflow with nine
destinations (#87), the swing's end-of-transition twitch (#89).

**Phase 6 — the September 2026 batch (§G):** ✅ all shipped on
`claude/roadmap-features-impl-c80870` → `dev` (#98), one commit per step below, in this order:

1. The four portfolio-content rows in one commit. They all touch `content/` and the résumé plugin,
   and none needs the backend.
2. The CTF chain in its own commit, following its spec.
3. The terminal rows that need no backend: prompt suggestions, `?run=` links, the shell versions
   of the tools, and the daily wordle without its histogram.
4. Tools vol. 3, five pure additions to the registry.
5. Presence in the scene and the screensaver.
6. The backend rows: `systemctl status`, the wordle histogram, the MCP server.
7. Two-player games last. It's the only L, and it changes the rooms' trust model.

**Phase 7 — the late-September brainstorm (§H):** proposed, not started. One branch per step:

1. **Fixes found on the way**, the rate-limit key first. Each is S and independent, and several
   later rows lean on them: `who`/`wall` on the rate limit, the case studies on experience as
   content, generated `llms.txt` on `ask` reading its own origin.
2. **`effects` on `Command`**, before anything that decides whether a command may run without
   the visitor typing it: `tour`, pipes and chains, history expansion.
3. **Show the work** and **prove the claims**. The case studies and `why` share one `Decision`
   type, so build `why` first; `tour` comes after `effects`. `strace` and the image inspector are
   independent of both.
4. **Rooms**: the queue sidebar and YouTube in radio together, since they touch the same page and
   one backend function. Titles in the queue follow, once, with both apps deployed together.
5. **The shell, deeper**: the shell over curl, then pipes, `man`, history.
6. **Craft and polish**, in any order. Motion control before `who`/`wall`, whose wave should
   honour it.

## Open

- Everything in [§H](#h-late-september-2026-brainstorm) is proposed and not started.
- A curation pass, which is a judgement call rather than a row: retire or fold the weakest joke
  commands, and record each removal here, the way *Dropped* records what never shipped.

## Known issues

- **`registry.ts` ↔ `commands/index.ts` is a circular import.** Pre-dates all of this: the command
  modules import `resolve()` back from the registry, whose top-level code builds the lookup Map.
  A clean load is fine because the registry is entered first, but entering `commands/index.ts`
  first throws `Cannot access 'coreCommands' before initialization` — seen once in the dev server
  during an HMR reload. The fix is to build the Map lazily so nothing runs at import time; it is
  a §H row, *Lazy registry + cycle guard*.

## Dropped

- **Spotify now-playing** — SoundCloud is the only player in use.
- **Lichess "recently played"** — not a game Jules plays, so the card would sit empty.

Cut from the §H brainstorm, mostly for one of two reasons: at this site's traffic a shared or
multiplayer feature is usually played alone, and §G already called the playground large.

- **Daily seeded boards for every game**, and a `wpm` ghost at the day's median — more of the same,
  and the ghost needs more reports per line per day than the site gets.
- **`reversi`**, a **typing-race room** and a **shared Game of Life** — more multiplayer on top of
  connect4, whose audience is unmeasured and probably small.
- **Reactions in watch and radio rooms** — people in a room brought their friends, who already
  have a chat app.
- **Sound cues**, off by default — few would ever turn them on. If sound comes, it starts from
  `acid`'s engine.
- **Beat-synced wireframes** and **an ambient drone** — both need a "SoundCloud is playing" signal
  the music section doesn't have (`useMusicPlayer` is only a remount nonce), plus per-track tempo
  entered by hand.
- **SoundCloud's latest uploads over RSS** — uncertain the feed exists for a non-podcast account,
  and deploy.md records SoundCloud blocking the host's IP once.
- **Owner broadcast** (`wall` from the admin) — rarely anyone to broadcast to, and another held
  stream per terminal; the name goes to the visitors' wave instead.
- **`iss` with SGP4** — a good from-the-standard stunt with no link to Jules, and another
  live-data toy beside `weather` and `btc`.
- **PWA share target** — needs visitors to install a portfolio first, and iOS doesn't support it.
- **Field reports** (CSP violations, errors, real Web Vitals) — beacons, however anonymous, cut
  against the site's no-RUM stance, and the incident that motivated them (#97) is covered by the
  production-CSP e2e spec.
- **Print styles with a QR back-link** — almost nobody prints a portfolio page, and the résumé
  already has a print version.
- **CTF vol. 2** — vol. 1 shipped days ago and nobody knows yet whether anyone finishes it. Its
  one urgent part, the payoff's wording, is a §H fix.
- **Import graph as the background**, **the repo mounted at `/usr/src`**, **a shaped filesystem
  with `/proc`** and **job control** — memorable, but L each, and the first two mostly duplicate
  GitHub, one click away. Worth revisiting once the shell has pipes.

---

## Appendix — `reboot` and fake `.env`

The two Phase-1 items as they were specified before implementation. Both shipped in Phase 1;
kept as a record — the code has since moved on in small ways (e.g. `reboot` gained the `restart`
alias, `env` reads the same module as `.env`).

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
