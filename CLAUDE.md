# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`jhemery.xyz` — a personal portfolio built as a terminal emulator over a three.js wireframe
background. Two independent npm projects, no workspace/monorepo tooling:

```
frontend/   Vue 3 + Vite + Tailwind 4 SPA (sections, terminal, games, achievements, PWA)
backend/    NestJS API (ask, contact, steam, github, weather, markets, presence, stats, guestbook,
            rooms, jobs, health, mcp)
docs/       features-spec.md, roadmap.md, deploy.md; superpowers/{specs,plans} for the bigger pieces
```

`README.md` is the user-facing reference for every terminal command, achievement and API route —
read it before changing behaviour that it documents, and update it when you do.
`docs/features-spec.md` is the design authority; several code comments cite it by section number.

## Commands

Run from `frontend/` or `backend/` — there is no root `package.json`.

The unit suites are spelt `npx vitest run` / `npx jest` rather than `npm test` (same scripts)
because the local rtk hook rewrites the direct forms to its failures-only filter and passes
`npm test` through raw.

```bash
cd frontend && npm run dev          # http://localhost:5173
cd frontend && npx vitest run       # npm test
cd frontend && npm run test:e2e     # playwright (builds + serves dist itself)
cd frontend && npm run type-check   # vue-tsc --build
cd frontend && npm run build        # type-check + build, in parallel
cd frontend && npm run lint         # eslint . (CI runs this; lint:fix rewrites)
cd frontend && npm run lighthouse   # lhci autorun against lighthouserc.yml budgets
```

```bash
cd backend && npm run start:dev     # http://localhost:3000 (needs .env; cp .env.example .env)
cd backend && npx jest              # npm test; *.spec.ts colocated under src/
cd backend && npm run test:e2e
cd backend && npm run lint          # eslint --fix (yes, CI runs the fixing variant)
```

Single test:

```bash
cd frontend && npx vitest run src/terminal/__tests__/registry.spec.ts -t 'suggests'
cd frontend && npx playwright test --project=chromium -g 'graceful'
cd backend && npx jest src/ask/ask.service.spec.ts -t 'rate limit'
```

Two kinds of committed output are vitest snapshots, which CI only ever compares: the curl pages
in `frontend/public/run/` (`curl jhemery.xyz/neofetch`) and the résumé's exact bytes. A change to a
command's output or to the content fails CI until they are rewritten:

```bash
cd frontend && npx vitest run src/terminal/__tests__/curl-pages.spec.ts src/content/__tests__/resume.spec.ts -u
```

### Two test suites, with a line between them

`src/**/__tests__/` (vitest, jsdom) owns behaviour: the command registry, every
command, the games, i18n, content purity. It is where a new assertion belongs by
default — it runs in seconds.

`frontend/e2e/` (Playwright) owns only what jsdom structurally cannot reach: that the
async chunks load, that live-data failures degrade instead of throwing, that a
section anchor scrolls a real viewport, that `/resume.txt` and friends survive the
SPA fallback. It builds `dist/` and serves it itself (`webServer` in
`playwright.config.ts`), and **never touches a real backend** — every API call is
stubbed by the `api` fixture against an unreachable origin, so a forgotten stub fails
loudly rather than reaching api.jhemery.xyz. Re-testing command behaviour through a
browser is the thing to avoid: it is a hundred times slower and covered already.

Preview servers are declared in `.claude/launch.json` (`frontend-dev`, `frontend-preview`,
`backend-dev`) — start them with the preview tools, not Bash.

## Architecture

### Content layer is build-time code

Everything under `frontend/src/content/` is the single source of truth for site copy, and is
**imported by `vite.config.ts` and `vite-plugins/resume.ts` at build time**, outside the app's
module graph. So these modules may only import their siblings — no Vue, no `@` alias, no
`window`/`document`/`localStorage`/`navigator`. `src/content/__tests__/purity.spec.ts` enforces
this; violating it breaks `npm run build` with an error pointing at the résumé plugin instead of
the offending file. The résumé plugin generates `/resume.txt` (also what the terminal's `curl`
prints), the printable `/resume.html` and `/resume.fr.html`, and `/content.json` from here, so the
CV has exactly one source. `content.json` is fetched at runtime by the **backend's** MCP endpoint
from `${FRONTEND_URL}`. That is the one place the two apps depend on each other, and the shape is
mirrored rather than shared (`backend/src/mcp/mcp.types.ts`), with the backend refusing any
`version` it doesn't list in `CONTENT_VERSIONS` (1 and 2 today). So a change to its shape needs a
new `version`, and a backend that accepts both the old and the new one: the two apps deploy from
the same push in no fixed order.

`docs/superpowers/specs/` is build input too: `vite-plugins/notes.ts` publishes each spec as a
static page at `/notes/<slug>` through a hand-written markdown renderer that fails the build on any
construct it doesn't know. So a spec edit can break `npm run build`, and the frontend build and
deploy workflows watch that folder.

`sections.ts` defines the six sections once; the navbar, terminal `ls`/`cd`/`pwd`, command palette
and every section header consume it.

### i18n: `Localised<T>`, not a translation library

`src/i18n/index.ts` holds a module-level `locale` ref (shared, not per-component) and exposes
`useLocale()` → `{ locale, t, m, setLocale, toggleLocale }`. Any user-visible string is a
`Localised<T> = { en, fr }` resolved with `t()`; UI chrome strings live in `src/i18n/messages.ts`,
content strings in `src/content/`. Facts (tech names, URLs, specs) stay plain strings.
`currentLocale()` is the non-reactive read for code outside a `setup()`.

### Terminal: the registry is the API

`src/terminal/commands/*.ts` each export an array of `Command` objects; `commands/index.ts`
concatenates them and `registry.ts` builds the name/alias map — on first use, because the registry
and the command modules import each other: never call a registry function at a command module's
top level (`registry-load.spec.ts` and `src/__tests__/import-cycles.spec.ts` will fail). Adding a
command means adding one object — never a special case in the shell. A `Command` declares its own
`writes` (required: `none`, `local` or `server`, or a function of the arguments — see `Writes` in
`types.ts`), `hidden` (out of `help` and Tab), `palette` (in Ctrl+K), `linkable` (worth running
from a `?run=` link, optionally a predicate of the arguments), `group`, `complete(ctx)` for
argument completion, and `manual` for what its man page adds to the generated one (every flag in
its `usage` needs OPTIONS text there, which `manual.spec.ts` checks); the shell handles prefix filtering, common-prefix insertion and ambiguity
listing generically. Anything that runs a command the visitor didn't type must ask
`isLinkable(command, args)`: opted in, not hidden, writes `none`, and every argument one the
command offers for Tab. `runLink` and `tour` do, and so does every stage of a linked pipe.
History expansion follows its own rule, read off the same `writes`: a line naming a
server-writing command (through an alias too) is never expanded, and an expansion that would
write anything waits in history for the visitor to send it. `ctx.run` checks nothing, so only
pass it fixed command lines. Read `writes` through `writesOf()`; `registry.spec.ts` pins the whole classification, so a new writer or a quiet
downgrade fails it.

A line is read by `terminal/parse.ts` (pipes, `;`, `&&`, `||`, `NAME=value`): quotes only group
(they hide operators), and a stage's words are still its text split on spaces, so commands read
their own quoting as they always have. On the left of a `|` a command has `tty: false` (`capture`
and `prompt` throw) and its output becomes the next stage's `stdin`. Report an operand or usage
error with `fail()` from `format.ts`: it is marked `stderr`, so it reaches the screen from inside
a pipe and is what stops `&&`. The error *tone* alone means nothing to the shell.

`CommandContext` (in `terminal/types.ts`) is the whole capability surface a command gets: `print`,
`frame()` for redrawable animation regions, `capture()` for holding the keyboard (how the games
work — released automatically when the command settles, so a throw can't wedge input), `prompt`,
`navigate`, `run` (recursion, for aliases), `effects` (matrix/reboot/crt/vim/glitch/music) and an
`AbortSignal` for Ctrl+C. Read the doc comments there before adding a primitive.

Output is `OutputLine[]` — plain text with tones/segments, **never HTML**. Commands render
user-supplied data (guestbook entries), so there is deliberately no markup escape hatch.

`useTerminal.ts` is the shell loop; `useTerminalShell.ts` the open/close state. `cat`, `vim` and
`diff` all read the same fake filesystem (`commands/files.ts`) so a file can't show two contents.

### Achievements

38 entries in `terminal/achievements.ts`, persisted under `couvbat:achievements` in
`localStorage`. `completionist` cascades off the other 37 and repaints the three.js palette.
Adding one means adding it to `achievementList` *and* the README's spoiler table.

### Colour schemes: tokens only

`theme` swaps every CSS token at runtime. Each scheme in `src/lib/themes.ts` is a dozen colours
that `themeTokens()` turns into the custom properties `:root` declares, written inline on `<html>`
by `composables/useTheme.ts`. The default (*cyberpunk*) is never written: switching back removes
the overrides, so `main.css` stays its only definition. The consequences for new code:

- Colour with tokens (`text-primary`, `text-warning`, `border-border`), never Tailwind's palette
  (`text-yellow-400` is unreadable on the two light schemes). Where a fixed colour is right, give
  it a `light:` variant.
- Code that reads colours in JS (three.js, canvases) must re-read `--neon-*` on a switch, by
  watching `useTheme().theme` or reading at draw time, not caching them on mount.
- `themes.spec.ts` holds every scheme to contrast floors and to writing exactly the tokens
  `:root` declares, so a new token needs deriving in `themeTokens()`. The floors live in one
  place, `lib/themeRules.ts`; muted and body text are lifted to them when the table is built,
  but the default never is, so a change to `main.css` has to pass on its own.

### Backend: NestJS, one module per capability

`app.module.ts` wires ~13 feature modules, each `{controller, service, dto, spec}`. `main.ts`
carries the cross-cutting decisions and explains each in comments: helmet with a `default-src
'none'` CSP (JSON API, never a document), CORS locked to `FRONTEND_URL` + localhost,
`trust proxy` at one hop so the per-IP `common/rate-limit.guard.ts` sees real clients behind Apache
(`CF-Connecting-IP` only from Cloudflare's ranges — don't "fix" the hop count to 2), and a
whitelisting `ValidationPipe`.

**Everything optional degrades gracefully.** No Steam key → live activity hidden; no GitHub token
→ heatmap dropped; unreachable LLM → the terminal says it's asleep. `ask`, `guestbook`, `rooms`,
`jobs`, `mcp` and `wall` are **off by default**. Endpoints report `configured: false` rather than
erroring, and the frontend renders that state. Preserve this when adding integrations.
`backend/.env.example` documents every variable and why the risky ones are off.

Privacy is a design constraint, not an afterthought: `/presence` pushes one integer over SSE with
no visitor id (and a contentless `wave` when `wall` is on), `/stats` counts sessions not commands,
`/weather` uses server-side coordinates so every visitor gets the same answer, and `ask` never logs
questions or answers. `strace` shows the shape of a request's bodies, never their values, and never
a header; anything new fed to the request observer in `lib/api.ts` must keep it that way.

### API base URL

`VITE_API_URL` is inlined by `vite build` — it must be set *where the build runs* (CI repository
variable), not next to the deployed `dist/`. `src/lib/api.ts` strips trailing slashes and falls
back to localhost **only in dev**; see the long comment there before touching it, it encodes two
previously-shipped bugs.

### Performance constraints worth not breaking

`ThreeBackground.vue` (~520 kB of three.js) is `defineAsyncComponent`'d, loaded on
`requestIdleCallback`, never fetched while motion is `paused` (`composables/useMotion.ts`, which
`prefers-reduced-motion` holds at `paused`), and **excluded from the PWA precache** — with a
runtime StaleWhileRevalidate rule instead. Its loop runs on elapsed time, not frames, under a
60 fps governor (30 under `calm` or with the terminal open): a new term in it scales by `f` or
eases with `ease(k, f)`, and allocates nothing. Animations read `decorativeMotion()`, not
`prefersReducedMotion()`, except the games, whose stepped mode is a rule change. The API is deliberately absent from
`runtimeCaching`: a stale "in game" is worse than an honest "unavailable". `navigateFallbackDenylist`
protects the real files (`/resume.txt`, `/llms.txt`, `/sitemap.xml`, …) from the SPA fallback.
The frontend PR check enforces Lighthouse budgets (`lighthouserc.yml`, median of five runs).

## Conventions

- Comments here explain *why*, often citing a spec section or a bug that motivated the code. Match
  that density — decisions get a paragraph, mechanics get nothing.
- British spelling in prose and identifiers (`Localised`, `normaliseBase`, `sanitised`).
- Frontend: `@/` alias, `<script setup lang="ts">`, Tailwind 4 (CSS-first config, no
  `tailwind.config.js`). Backend: NestJS conventions, prettier-enforced.
- Tests colocate in `__tests__/` (frontend) or beside the source (backend).

## Branching

**`dev` is the integration branch. Never branch from `master`, never PR into `master`.**

```
master   release branch — only ever receives a PR from dev, opened by the repo owner
  └ dev  integration branch — branch from here, PR back into here
      └ feat/… | fix/… | claude/…   one feature or fix each
```

So the loop for any piece of work is: start from an up-to-date `dev`, do the work on a branch off
it, and when it's done open a PR **targeting `dev`**. Stop there — promoting `dev` to `master` is
the owner's call, not something to open on their behalf.

```bash
git fetch origin && git switch -c feat/my-thing origin/dev
# …work…
gh pr create --base dev
```

`*-pr-check.yml` runs on PRs into either `master` or `dev`, and again on pushes to `dev` so the
merged result is checked before `dev` is proposed to `master`. Both are **unfiltered** — they run
the frontend *and* backend suites on every PR regardless of what it touches, because they are
required status checks and GitHub reads a workflow that never triggered as permanently pending
rather than passed. Don't add a `paths:` filter back; it makes single-app PRs unmergeable.

`*-build.yml` and the deploys are path-filtered per app and stay on `master` only — merging into
`dev` never ships anything. Deploys go over SSH via the cPanel API, with a manual FTP fallback.

Dependabot sets `target-branch: dev` on every entry, so its PRs follow the same route as
everything else. Note that Dependabot reads `.github/dependabot.yml` from the **default branch**
(`master`) — changing that file only takes effect once the change reaches `master`, not when it
merges into `dev`.
