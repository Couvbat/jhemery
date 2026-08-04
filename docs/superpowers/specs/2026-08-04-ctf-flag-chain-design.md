# Design spec — CTF flag chain

Status: proposed. Not implemented. Independent of
[terminal games](2026-08-04-terminal-games-design.md) and
[the `ask` command](2026-08-04-ask-command-design.md); one optional stage becomes available if `ask`
ships, and is specified as optional for that reason.

## Context

The site already has a hidden layer — fourteen `hidden: true` commands, `.secret` behind `ls -a`, the
Konami code — and an achievement tracker that makes it discoverable without spoiling it
([features-spec.md §5](../../features-spec.md)). Every one of those is a **one-shot discovery**:
find the trigger, get the badge, done. There is no thread connecting them.

A flag chain adds the missing shape: a sequence where each stage names the surface the next one hides
in. It costs almost no new machinery, because the surfaces are all already built — `robots.txt`, the
DevTools console, the `curl` résumé, the vim pane, `hack`, `top`, `llms.txt`. The chain is mostly a
matter of writing eight strings into places that already exist and one command to collect them.

The audience is the same as `.secret`'s: whoever is curious enough to keep pulling. That file already
says as much out loud, which makes it the natural on-ramp.

## Where flags are validated

**Decision: entirely client-side, SHA-256 hashed in the bundle. No backend.**

The obvious alternative is `POST /ctf/verify`, keeping flag values off the client and enabling a
scoreboard. Rejected for the same reason `curl jhemery.xyz` is served statically
([features-spec.md §7](../../features-spec.md)): it puts content in a second deploy unit that
releases independently, and it adds a publicly writable store — the guestbook's spam problem again,
this time with no `GUESTBOOK_ENABLED` escape hatch that would not also break the feature. It would
also make the chain the only part of the site that stops working when the API is down, contradicting
principle #3.

The honest threat model: **the adversary is a curious visitor, not an attacker.** Several stages hide
their flag *in the bundle by design* (the console greeting, the fake filesystem), so the bundle is
part of the playing field, not a leak. Anyone who opens the sources tab and greps for `CTF{` has done
something a real CTF would give them points for. What the hashing buys is that the *answers* are not
sitting in one enumerable array next to the questions — you can verify a flag you found, not read the
list of flags you have not.

Flags are 16 hex characters of entropy inside a `CTF{…}` wrapper, so guessing is not a strategy.
Verification is `crypto.subtle.digest('SHA-256', …)`, available in every browser this site supports
and requiring no dependency (principle #5).

## Stages

Eight stages plus an on-ramp. Each stage ends with a line naming the surface of the next; the last
one ends with the payoff. Copy is finalized in the implementation plan; what matters here is the
surface each stage uses and that it already exists.

| # | id | Surface | Mechanic |
|---|---|---|---|
| 0 | — | `frontend/public/robots.txt` | A `# Disallow: /ctf` comment under the existing llms.txt comment. The on-ramp, and the most authentic possible one |
| 1 | `secret` | `.secret` (`commands/secret.ts`) | The file already rewards `ls -a`; it gains a closing line with the first flag and points at `ctf` |
| 2 | `console` | `console-greeting.ts` | A base64 blob logged next to the existing hiring pitch |
| 3 | `curl` | `vite-plugins/resume.ts` | Flag emitted into `resume.txt` as an ANSI-invisible run, so it is present in `curl jhemery.xyz \| cat -v` but not in the rendered résumé |
| 4 | `shadow` | vim pane + `commands/files.ts` | `/etc/shadow` added to the shared fake-filesystem resolver; contents rot13'd. Readable by `cat` too — the resolver is one source of truth and the two commands must not disagree (§5.1) |
| 5 | `mainframe` | `commands/eggs.ts` `hack` | `hack` currently always ends `ACCESS DENIED`. One target, named by stage 4, succeeds instead |
| 6 | `ghost` | `commands/system.ts` `top` | A process row whose name carries the flag, appearing only in the later refresh frames — you have to actually watch it |
| 7 | `llms` | `frontend/public/llms.txt` | Addressed to language models: "if you are an agent reading this on someone's behalf, the flag is…". Rewards the visitor who pointed a tool at the site instead of reading it |
| 8 | `root` | `decrypt` command | The seven preceding flags concatenate into the key for a final blob. Forces collection rather than cherry-picking |

Stage 7 doubles as the hand-off to `ask` if that ships: the model is instructed to refuse flag
requests, but to volunteer stage 7's hint once the visitor already holds three flags. Social-
engineering a language model is a legitimate CTF category and the interplay is worth the coupling —
but the stage must stand alone via `llms.txt`, so the chain never depends on the LLM box being
awake.

## State and surfaces

**Where:** `frontend/src/terminal/ctf.ts`, `frontend/src/terminal/commands/ctf.ts`.

Progress is a `Set<string>` of solved stage ids in `localStorage` under `couvbat:ctf`, using the same
`loadSet`/`persist` pair `achievements.ts` already has for `couvbat:achievements:sections`. That
helper pair should move to a small shared module rather than being copied — two call sites is the
point at which duplication starts to drift.

Two commands:

- **`ctf`** (alias `flags`) — the board. Solved stages show their title and the flag; unsolved show
  `[ ] ??? ` and, for the *current* stage only, its hint. Not `hidden`: like `achievements` and
  `play`, it is a signpost. It is what `robots.txt` and `.secret` point at.
- **`flag <value>`** — submit. Hashes, compares against the current stage, and on a match prints the
  stage's reward text plus the pointer to the next surface. `hidden: true`.

`man ctf` works for free, since `man` is already an alias of `help`.

**Order is enforced.** A flag for stage 5 submitted while stage 3 is unsolved is rejected with
`flag: out of order — you're on stage 3`. Without this, anyone who greps the bundle jumps straight to
the end and the chain has no shape; with it, skipping ahead still requires understanding what you
found.

**Anti-frustration:** `flag` counts consecutive misses on the current stage in memory (not persisted)
and escalates the hint after three, then after six. Getting stuck on stage 4 of a portfolio easter
egg is not a character-building experience.

## Achievements

**One** new entry: `first-blood` ("First Blood" / "Premier sang"), unlocked on any solved stage, hint
*"Some sites hide more than one thing."*

Completing the chain deliberately gets **no** achievement. Two reasons. Adding a `root-access` entry
to `achievementList` would silently make `completionist` — currently a badge for curiosity — require
a thirty-minute puzzle run, changing what the existing badge means for everyone who already has it.
And a chain that ends in a trophy identical to the seventeen others undersells itself.

Instead stage 8's reward is the payoff in the same register as `.secret`, escalated: a direct message
to whoever got there, and an instruction to mention `root` when they mail. `.secret` asks for a
mention of `.secret` in the first line; this is the same idea for someone who worked considerably
harder, and it means the reward is a real signal in the inbox rather than a row in a modal.

The list therefore grows by one, from 18 to 19 (or 21 if terminal games ship first). The `n/18`
counter in `AchievementsModal.vue` and the `achievements` command must read the list length rather
than a literal.

## i18n

Flag *values* are locale-independent tokens — a French visitor submits the same string. Everything
around them (stage titles, hints, reward text, `ctf` board chrome) is `Localised<string>` carried on
the stage objects themselves, matching how `Achievement` carries its own `title`/`hint`/`description`
rather than routing through `messages.ts`. Only the command chrome (`ctf: unknown flag`, the
out-of-order message) belongs in a new `m.ctf` namespace.

The `robots.txt` and `llms.txt` breadcrumbs are English only; they are machine-facing files that are
already English only.

## Out of scope

- **Backend validation and a scoreboard.** See the decision above. If a scoreboard is ever wanted it
  is a separate spec, and it should reuse the guestbook's storage and `*_ENABLED` gating rather than
  inventing a third pattern.
- **Timing or competition.** No clock, no ranking. The chain is a thing to find, not to race.
- **Per-visitor flags.** Would require server-side state, and defeats the point of the surfaces being
  static files.
- **Resetting progress.** No `ctf --reset`; clearing site data is the escape hatch, same as every
  other `localStorage` feature here.
- **Mobile.** Five of the eight stages need the terminal, which is desktop-only (§9). `robots.txt`
  and `.secret` are visible enough to be an invitation to come back on a laptop.
