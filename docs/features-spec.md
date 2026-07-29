# Feature spec — terminal mode, easter eggs & friends

Status: implemented. This document is the reference for what was built, why, and where the
seams are. It describes the target state; where a decision was contentious the trade-off is
recorded inline rather than in a separate changelog.

## Context

The site is a single-page Vue 3 portfolio with a cyberpunk terminal aesthetic. Six sections
(`about`, `projects`, `music`, `gaming`, `hardware`, `contact`) render on one route, backed by a
NestJS API exposing `/contact`, `/steam/activity` and `/github/activity`.

The hero already renders a *fake* terminal — `whoami`, `cat about.txt`, `ls skills/`. The features
below add a *real* one. The distinction matters: if the interactive terminal only reprinted the
hero's content it would be decoration twice over. Everything here is built so the terminal does
things the static page cannot — query live APIs, send mail, mutate the page.

## Design principles

1. **One source of truth for content.** The terminal and the rendered sections read the same
   data modules. Without this the bio has to be maintained twice and will drift.
2. **The registry is the API.** Adding a command is adding one object to an array. `help`,
   tab-completion and the command palette are all derived from it — none of them hardcode a list.
3. **Progressive, never blocking.** Every live-data command degrades to a useful message when the
   backend is unreachable or unconfigured. The site works with the API entirely down.
4. **Motion is opt-out-able.** Everything animated checks `prefers-reduced-motion`.
5. **No new runtime dependencies.** i18n, the terminal and the effects are all hand-rolled against
   what is already installed (Vue, Tailwind, Three.js).

---

## 1. Shared content layer

**Where:** `frontend/src/content/*`, `frontend/src/i18n/*`

Section content moves out of the `.vue` files into dependency-free TypeScript modules. "Dependency
free" is a hard requirement, not a style preference: the build-time resume generator (§7) imports
these modules from `vite.config.ts`, so they must not import Vue, the `@` alias, or anything with
side effects.

```
src/content/
  types.ts       Localised<T>, Project, Machine, …
  profile.ts     name, alias, role, employer, location, languages, bio paragraphs
  skills.ts      flat skill list
  projects.ts    Project[] with status + stack
  music.ts       genres, tools, blurb, playlist URL
  gaming.ts      genres, platforms, fallback game log, blurb
  hardware.ts    machines[] + peripherals[]
  contact.ts     socials, availability line
  sections.ts    section ids, nav labels, per-section shell prompt lines
  index.ts       re-exports
```

Localised strings use `Localised<T> = { en: T; fr: T }`. Purely factual values (hardware specs,
skill names, URLs, project stacks) stay unlocalised — translating "Samsung 990 EVO Plus 2TB NVMe"
would be noise.

### i18n

A ~40-line composable, not a library. `useLocale()` exposes a module-level `locale` ref (shared
across every caller), a `t(localised)` resolver, and `setLocale()` which persists to
`localStorage` and updates `<html lang>`. Initial value: stored preference → `navigator.language`
→ `en`.

Surfaces: a `EN/FR` toggle in the navbar, and the `lang [en|fr]` terminal command.

**Trade-off:** full-site i18n roughly doubles the copy that has to be maintained. It is included
because the profile advertises both languages and a French visitor landing on English copy is a
worse first impression than the maintenance cost. If it becomes a burden, the escape hatch is to
make `t()` fall back to `en` for any missing `fr` key.

---

## 2. Terminal core

**Where:** `frontend/src/terminal/*`, `frontend/src/composables/useTerminal.ts`,
`frontend/src/components/terminal/*`

### Command contract

```ts
interface Command {
  name: string
  aliases?: string[]
  usage?: string
  description: Localised<string>
  group: 'core' | 'navigate' | 'content' | 'live' | 'fun'
  hidden?: boolean       // excluded from help + completion, still runnable
  palette?: boolean      // surfaced in the Ctrl+K palette
  run(ctx: CommandContext): OutputLine[] | Promise<OutputLine[]> | void
}
```

`CommandContext` carries the parsed `args`, the raw input, the current `locale`, and side-effect
handles the command may use: `print()`, `clear()`, `close()`, `navigate(sectionId)`,
`prompt(question)` (returns a promise resolving to the next line the user types), and `effects`
(matrix, crt, vim-trap).

`OutputLine` is `{ text: string; tone?: 'default'|'muted'|'primary'|'accent'|'secondary'|'error'|'success'; href?: string }`.
Deliberately *not* HTML — output is rendered as text nodes so no command can inject markup.

### Registry

`registry.ts` holds the array plus `resolve(name)` (honouring aliases), `complete(prefix)` and
`visibleCommands()`. `help` renders straight from `visibleCommands()` grouped by `group`, so a new
command documents itself.

### Session state

`useTerminal()` is a module-level singleton (the launcher, the overlay, the palette and the 404
page all talk to the same session, so history survives closing the panel).

- `lines`: rendered output buffer, capped at 500 entries.
- `history`: submitted commands, capped at 100, persisted to `localStorage`.
- ↑/↓ walk history, `Tab` completes (common prefix first, then lists candidates),
  `Ctrl+L` clears, `Ctrl+C` cancels an in-flight interactive prompt.
- `run(input)` handles `&&`-free single commands only — chaining is out of scope.

### Chrome

- `TerminalLauncher.vue` — sticky bottom-right button, `md:` and up only (see accessibility).
- `TerminalOverlay.vue` — bottom-anchored panel, `max-w-4xl`, with a maximise toggle. Title bar
  matches the existing fake-terminal chrome (three dots + `couvbat@portfolio ~ bash`).

Open/close: click the launcher, press `` ` `` (backtick) anywhere outside an input, or `Ctrl+``.
`Esc` closes — unless a vim trap is active (§5), which is the joke.

---

## 3. Commands

Grouped as they appear in `help`.

### core
| Command | Behaviour |
|---|---|
| `help [command]` | Generated from the registry; `help <cmd>` prints usage + description |
| `clear` | Empties the buffer |
| `history` | Numbered list of past commands |
| `echo <text>` | Prints its arguments |
| `date` | Local date/time |
| `lang [en\|fr]` | Prints or switches locale |
| `exit` | Closes the overlay |

### navigate
| Command | Behaviour |
|---|---|
| `ls [-a]` | Lists sections as directories. `-a` also reveals `.secret` (§5) |
| `cd <section>` | Scrolls to the section and closes the overlay |
| `pwd` | Current section, derived from scroll position |
| `cat <file>` | `about.txt`, `skills.txt`, `contact.txt`, `.secret` |
| `open <target>` | `github`, `linkedin`, `soundcloud`, `steam`, `email` — opens in a new tab |

### content
Reads from §1, so it can never contradict the page: `about`, `skills`, `projects [--json]`,
`music`, `gaming`, `hardware [pc|nas|peripherals]`, `resume`, `neofetch`.

`neofetch` renders an ASCII logo beside a spec block — stack, locale, "uptime" since the first
commit, and the live Steam status if available.

### live
| Command | Endpoint | Fallback |
|---|---|---|
| `steam` / `playing` | `GET /steam/activity` | static game log from `content/gaming.ts` |
| `gitlog` (alias `git log`) | `GET /github/activity` | "no activity available" |
| `contrib` | `GET /github/contributions` | hidden if unconfigured |
| `guestbook` | `GET /guestbook` | "guestbook is closed" |
| `sign <message>` | `POST /guestbook` | error line |
| `mail` | `POST /contact` | error line |

`mail` is interactive: it prompts name → email → subject → message in sequence via
`ctx.prompt()`, validates the email client-side, echoes a summary, and asks for `y/n` before
posting. `Ctrl+C` aborts at any step.

---

## 4. Command palette

**Where:** `frontend/src/components/CommandPalette.vue`

`Ctrl+K` / `Cmd+K` opens a filtered list of commands flagged `palette: true` — navigation, the
content commands, and language switching. Selecting a navigation command scrolls directly;
selecting an output command opens the terminal with that command already run.

This exists so the ~90% of visitors who will never type into a terminal still get the fast path.
It shares the registry, so it needs no separate maintenance.

---

## 5. Easter eggs

**Where:** `frontend/src/terminal/commands/eggs.ts`, `frontend/src/components/effects/*`,
`frontend/src/composables/useKonami.ts`, `useCrt.ts`

| Trigger | Effect |
|---|---|
| `sudo <anything>` | `couvbat is not in the sudoers file. This incident has been reported.` |
| `sudo rm -rf /` | Fake cascading deletion, page desaturates, then restores with a wink |
| `matrix` | Full-screen canvas digital rain; any key or click exits |
| Konami code (anywhere) | CRT overdrive — scanlines intensify, chromatic aberration, background wireframes speed up. Toggles off on repeat |
| `vim` | Traps the terminal; `Esc` no longer closes it; only `:q!` escapes, with escalating hints |
| `ls -a` → `cat .secret` | Hidden file with a message aimed at whoever is curious enough to look |
| `hack [target]` | Fake nmap/progress output ending in `ACCESS DENIED — nice try` |
| `coffee` | `HTTP 418: I'm a teapot` |
| `play` | Scrolls to the music section and starts the SoundCloud embed |
| `cowsay <text>` | ASCII cow |
| `fortune` | Random dev aphorism |
| `sl` | ASCII train, animated across the buffer |
| `rickroll` | Asks for confirmation first, because doing it unprompted is rude |
| DevTools console | ASCII art + a short hiring pitch on load |

Hidden commands (`sudo`, `vim`, `matrix`, `hack`, `coffee`, `sl`, `rickroll`, `cowsay`, `fortune`)
are `hidden: true` — they don't appear in `help`. Finding them is the point. `help --all` lists
them for the impatient.

**Motion:** `matrix`, `sl` and CRT overdrive check `prefers-reduced-motion` and degrade to a
static frame or a plain text response.

---

## 6. Boot sequence, 404, footer, console

- **Boot sequence** (`BootSequence.vue`) — fake kernel log resolving into the page. Shown once,
  gated on `localStorage['couvbat:booted']`, skippable with any key or click, ~2.2s at most.
  Skipped entirely under `prefers-reduced-motion`.
- **404** (`NotFoundView.vue`) — `bash: /<path>: No such file or directory`, a `cd ~` button, and
  (desktop only) a hint to open the terminal. Requires `frontend/public/.htaccess` with an SPA
  rewrite; without it Apache 404s before Vue Router ever sees the URL. This closes a gap already
  flagged in [deploy.md](deploy.md).
- **Footer** (`SiteFooter.vue`) — commit SHA and build timestamp, injected by Vite `define` as
  `__BUILD_SHA__` / `__BUILD_TIME__`, read from `git rev-parse` at config time with a `dev`
  fallback so a tarball build doesn't break.
- **Console art** — `console.log` in `main.ts`. Costs nothing; the people who open DevTools on a
  developer portfolio are exactly the target audience.

---

## 7. `curl jhemery.xyz`

**Where:** `frontend/vite-plugins/resume.ts`, `frontend/public/.htaccess`

A Vite plugin imports `src/content/*` and emits `dist/resume.txt` — an ANSI-coloured plain-text
résumé — at build time. `.htaccess` rewrites requests whose `User-Agent` matches
`curl|wget|httpie|lynx` to that file.

**Decision:** this is served entirely from the static frontend, with no backend involvement. The
obvious alternative — a Nest `GET /resume` endpoint — would mean the résumé content lives in the
backend too, duplicating §1 across two deploy units that release independently. Generating from
the single source at build time is strictly better. The cost is that the résumé only refreshes on
a frontend deploy, which is fine for a résumé.

`.htaccess` needs `mod_rewrite` only — no `mod_proxy` — so it works on shared hosting.

---

## 8. Backend additions

### `GET /github/contributions`

GitHub's REST API does not expose the contribution graph; the GraphQL
`user.contributionsCollection.contributionCalendar` does, and it requires a token. Returns
`{ configured: false }` when `GITHUB_TOKEN` is absent, and the frontend hides the card. Cached for
one hour — the graph updates at most daily.

Rendered in `ProjectsSection` as an ASCII heatmap using `·░▒▓█`, 53 weeks × 7 days, horizontally
scrollable on narrow viewports.

### Guestbook

**Off by default.** `GUESTBOOK_ENABLED` must be set to `true`. A publicly writable text field on a
personal site is a spam magnet, and enabling it silently on someone's behalf is not a decision to
make for them.

When enabled:
- Storage: MongoDB (via Mongoose) when `MONGODB_URI` is set, in a `guestbook_entries` collection.
  Otherwise falls back to a JSON file under `DATA_DIR` (default `uploads/`) — chosen because the
  backend deploy rsync already excludes `uploads`, so entries survive deploys. The Mongo connection
  is lazy (first request) and a failed/absent connection silently falls back to the JSON file.
- `POST /guestbook` — `{ name, message }`, both required. Name ≤ 40 chars, message ≤ 280.
- Sanitisation: strips control characters and angle brackets, collapses whitespace, rejects
  messages containing URLs (the single highest-signal spam heuristic for a guestbook).
- Rate limit: one write per IP per 60s, plus a global cap of 500 stored entries (oldest evicted).
- `DELETE /guestbook/:id` — requires `x-admin-password` matching `ADMIN_PASSWORD`.
- The same rate-limit guard is applied to `POST /contact`, which previously had none. Slightly
  beyond the original brief, but the guard had to be written anyway and leaving the contact form
  unlimited next to a limited guestbook would be odd.

Output is rendered as text in the terminal (never `v-html`), so a stored payload cannot execute.

---

## 9. Accessibility

Retrofitting these is painful, so they are part of the definition of done:

- Terminal overlay: `role="dialog"`, `aria-modal="true"`, focus trapped inside, focus restored to
  the launcher on close, `Esc` closes (except during the vim trap).
- Output buffer: `aria-live="polite"` with `aria-atomic="false"` so screen readers announce new
  lines rather than re-reading the whole buffer.
- Command palette: `role="listbox"`, arrow-key navigation, `aria-activedescendant`.
- Every animated feature honours `prefers-reduced-motion`.
- The launcher is `hidden` below `md`. Mobile virtual keyboards fight fixed-position input panels
  badly enough that a bad terminal is worse than none; mobile users get the full rendered page,
  which carries the same information. `Ctrl+K` remains available for anyone on a tablet with a
  keyboard.

## 10. Explicitly out of scope

- **Light theme** — the palette is committed to always-dark and reads as deliberate.
- **Blog** — infrastructure without content is worse than no infrastructure.
- **Command chaining / pipes** — `ls | grep` is a lot of parser for a joke nobody will run twice.
- **Terminal on mobile** — see §9.
