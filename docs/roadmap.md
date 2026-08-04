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
| [ ] | `btc` / `stonks` | Needs a backend proxy (CORS blocks browser→exchange). Tiny route, shape of steam's. ASCII sparkline reuses the games' box-drawing conventions. | backend proxy (new), command | M |
| [x] | `banner <text>` | Client-side only: embedded 5×7 block-letter font table, rendered through `art()`/`pre`. Font table is the only real work. | `terminal/ascii-banner.ts` (new) + command | M |
| [x] | Argument autocompletion | Optional `complete?(ctx): string[]` on the `Command` interface; `completeInput()` splits the line, works out which word the cursor is on and routes past the first word to the owning command — through an alias expansion, so `zz ab` completes against what `zz` runs. Sources: a shared `listFiles()` in `files.ts` (one source `ls`, `cat`, `vim` and `diff` all read) for filenames; `sectionIds` for `cd`/`ping`; alias names for `unalias`; `on`/`off` for `gravity`/`constellation`; visible command names for `help`; plus `open`, `lang`, `scene`, `ls -a`, `ssh`, `whois`. Alias names join the command-word candidates. Same `commonPrefix()` and print-when-ambiguous behaviour, one word later. **Departure from the plan:** a dotfile joins `listFiles()` only once its achievement is unlocked — `cat .`+Tab must not hand out `.secret`, same rule `suggest()` follows. | `types.ts`, `registry.ts`, `useTerminal.ts`, `files.ts`, `guestbook-fs.ts`, per-command `complete` in `navigate.ts`/`core.ts`/`eggs.ts`, `__tests__/completion.spec.ts` | M |

## C. Live information

Passive data cards — no achievements (see §D).

| ✔ | Feature | Approach | Files | Effort |
|---|---|---|---|---|
| [x] | Build/deploy status card | Reuses the **existing** `GITHUB_TOKEN` + `github.module` — one `GET /github/workflow-status` route on the Actions REST API. Cheapest live item. | `backend/src/github/*` (extend), frontend card | S–M |
| [ ] | Visitor counter / presence | NestJS's native `@Sse()` (no new dep) broadcasting a periodic aggregate count. Aggregate only — no per-visitor data. | `backend/src/presence/*` (new), `usePresence.ts` (new) | M |
| [x] | Uptime/status ticker | Extends `neofetch`'s "days since first commit" calc into a visible status line; "last deploy" reuses already-fetched GitHub activity. | small status composable | S |
| [x] | Weather-linked background mood | `useWeather.ts` maps the condition to a `{ speed, opacity }` pair `ThreeBackground` multiplies into what the section palette already decided — storm faster, fog dimmer, snow slower, night dimmer still. Opacity always scales from each shape's stored `baseOpacity`, so repeated changes cannot ratchet the scene to invisible. The single request is made by `ThreeBackground` on mount and `weather` reuses it; under reduced motion the component never mounts, so the call never happens. | `useWeather.ts`, `ThreeBackground.vue` | M |
| [x] | Live guestbook ticker | **Polling, not SSE**: `GET /guestbook` every ~20s, diff for new entries, surface through `AchievementToast.vue`'s existing pattern. No new backend. | poller composable + toast component | S–M |
| [ ] | Global command counter | Fire-and-forget, incremented once per **terminal session open** (`useTerminal.ts`'s `primeOverlay()`), not per command — matches the `ask` route's "never logs content" stance. | `backend/src/stats/*` (new, tiny), one call site | S–M |

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

**Phase 3 — the rest, one at a time (M–L):**
Argument autocompletion ✅ shipped on `feat/phase-3-completion` → `dev` — the only one that needed
no backend, and it makes every command already shipped easier to find. Then the infra ones, still
to do: `weather` (+ weather-linked mood), `btc`/`stonks`, presence SSE, command counter.

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
