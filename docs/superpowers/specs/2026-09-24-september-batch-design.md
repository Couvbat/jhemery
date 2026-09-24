# Design spec — the September 2026 batch (roadmap §G)

Status: implemented on `claude/roadmap-features-impl-c80870`. The roadmap's approach column is
the brief for each row; this file records only the decisions that column left open, and the places
where building it changed the plan. The CTF chain has its own spec
([2026-08-04-ctf-flag-chain-design.md](2026-08-04-ctf-flag-chain-design.md)) and is covered here
only where the implementation had to choose.

## Portfolio content

**Availability** moves from `contact.ts` to `profile.availability = { open, note }`. `open` is the
fact the footer and `neofetch` branch on (a filled or hollow dot, `Status: open`/`closed`); `note`
is the sentence. `contact` and `contact.txt` keep printing the note, now from the one place.

**Skills with evidence.** `skills.ts` exports `Skill[]` plus `skillNames`, the plain list every
reader that only wants names (the résumé, `skills.txt`, `resume`) now takes. `usedIn[].where` is
either a `goTo()` path or an `https:` URL, and `isExternal()` is the one test for which. Three
skills are added because the repository can show them — SSE, WebAssembly, GraphQL — and three.js
because the background is the first thing anyone sees. Nothing is claimed that has no `usedIn`
backing it, except the long-standing names, which keep their plain badge.

**Printable résumé.** Two files, `resume.html` and `resume.fr.html`, from one builder that takes a
locale: the site is bilingual and a French recruiter printing an English CV is the thing to avoid.
The stylesheet is `resume.css`, a sibling file, so the CSP's `style-src 'self'` covers it with no
change. No script, no SPA, no fonts beyond the system monospace stack. The contact section links
the one matching the current locale.

**`/now`.** A route outside the prism, which settles the roadmap's open question: `views.ts`
stays four faces, so the navbar gains nothing. `viewIndex()` already puts any path that is not a
face after the last one, so the swing still turns the right way. The page is linked from the
footer and from `cat now.txt`. Staleness is `staleDays(updated, now)` in the content module, so the
page and the file read one rule: past 90 days both say how old the list is.

## Terminal

**`?run=` links.** Opened only at `min-width: 768px`, the launcher's breakpoint. The parameter is
removed with `router.replace` once read. The command is resolved **without the visitor's
aliases** — a link's author must not be able to reach whatever the reader named `ls` — and runs
only if the resolved command is `linkable`. A refused link prints why instead of running.
Invariants in `registry.spec.ts`: nothing that writes (`mail`, `sign`, `sudo`, `alias`, `unalias`,
`theme`, `lang`, `flag`) is linkable, and nothing hidden is — a link must not hand out an easter
egg. Games are linkable: they write nothing until the reader plays.

**Shell versions of the tools.** No pipes: the shell has none and adding them would be the special
case the registry exists to avoid. `sha256sum` and `base64` take a fake-filesystem file when the
argument names one, and literal text otherwise, printing `-` as the name the way `echo … |` would.

**Prompt suggestions** use the `placeholder` attribute, so they are never in the buffer, never
typed and never read by the copy-paste path. Drawn from visible commands whose usage has no
required argument.

**Daily wordle.** The answer is `hash(YYYY-MM-DD, UTC) mod words.length` over the locale's answer
list (FNV-1a, stable across engines). The board is stored per locale under
`couvbat:games:wordle:daily` as `{ day, guesses, marks, done, won, reported }` after *every* guess,
so closing the tab mid-game resumes the same rows rather than handing out six new ones, and a
finished board is shown again instead of replayed. `wordle share` copies
`jhemery.xyz wordle en 2026-09-24 4/6`, the emoji grid and a `?run=wordle%20daily` link. The
histogram (`POST /stats/wordle`) is reported once per board (`reported`), keeps 14 days per locale
in `stats.json`, and drops older days on write.

## Tools, vol. 3

**`qr` is hand-written**, byte mode, versions 1–40, all four EC levels, mask chosen by the
standard's penalty score. ~300 lines against a dependency, and `ffmpeg` stays the only exception.
Verified against a reference encoder's module matrices in the spec, not just "it scans".

**`regex`** runs in a module Worker created per run and terminated at 1 s; the pure matcher is
`regex.ts`, which the spec calls directly. Match output is capped at 1 000 matches.

**`cron`** covers five fields, ranges, steps, lists, month and weekday names, `@hourly`-style
macros, and the Vixie rule that a restricted day-of-month *or* day-of-week matches. Next runs are
found by walking minutes with day-level skips, capped at four years so `0 0 30 2 *` answers
"never" instead of hanging.

**`diff`** gains `unifiedDiff()` in `terminal/diff.ts` (three lines of context, `@@` hunks); the
command keeps its full listing.

## Background

**Presence in the scene** caps at 12 visitor shapes. They are a separate pool from `spawn`'s, so
`spawn` and the 60-shape limit keep meaning what they did.

**Screensaver**: three idle minutes with the tab visible. `ThreeBackground` owns it, so reduced
motion needs no branch. It will not start while the terminal holds the keyboard
(`terminalCapturing`, a light flag in `useTerminalShell`) or a room is playing (`roomPlaying`,
set by `useRoom`). The waking key is swallowed.

## Backend

**`GET /health`** asks each service for `health()`, a method that reads only fields the service
already holds: configured, enabled, last fetch time. Units are named after their modules. The
frontend keeps the unit list too, so with the API down it can print every unit as `unknown`.

**MCP** is hand-written rather than `@modelcontextprotocol/sdk`: a stateless Streamable-HTTP
endpoint that answers `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list` and
`resources/read` with plain JSON, `202` for notifications, and `405` to `GET`. The server
never needs a session, a stream or a write, so the SDK's surface would be almost all unused.
Content comes from `${FRONTEND_URL}/content.json`, cached 10 minutes.

**Two-player games: connect four**, not battleship. Battleship needs hidden state the server would
have to hold to keep a player honest, which is exactly the trust the rooms do not have. Connect
four's state is public, so the server stores the move list and enforces only turn order, column
range and column height. Wins are the pure module's business. A `connect4` room issues a seat token
on its first join and refuses a third player. It is a terminal game, not a prism face.
