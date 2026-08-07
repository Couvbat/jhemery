# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`jhemery.xyz` — a personal portfolio built as a terminal emulator over a three.js wireframe
background. Two independent npm projects, no workspace/monorepo tooling:

```
frontend/   Vue 3 + Vite + Tailwind 4 SPA (sections, terminal, games, achievements, PWA)
backend/    NestJS API (ask, contact, steam, github, weather, markets, presence, stats, guestbook)
docs/       features-spec.md, roadmap.md, deploy.md; superpowers/{specs,plans} for the bigger pieces
```

`README.md` is the user-facing reference for every terminal command, achievement and API route —
read it before changing behaviour that it documents, and update it when you do.
`docs/features-spec.md` is the design authority; several code comments cite it by section number.

## Commands

Run from `frontend/` or `backend/` — there is no root `package.json`.

```bash
cd frontend && npm run dev          # http://localhost:5173
cd frontend && npm test             # vitest run
cd frontend && npm run type-check   # vue-tsc --build
cd frontend && npm run build        # type-check + build, in parallel
cd frontend && npm run lint         # eslint . (CI runs this; lint:fix rewrites)
cd frontend && npm run lighthouse   # lhci autorun against lighthouserc.yml budgets
```

```bash
cd backend && npm run start:dev     # http://localhost:3000 (needs .env; cp .env.example .env)
cd backend && npm test              # jest, *.spec.ts colocated under src/
cd backend && npm run test:e2e
cd backend && npm run lint          # eslint --fix (yes, CI runs the fixing variant)
```

Single test:

```bash
cd frontend && npx vitest run src/terminal/__tests__/registry.spec.ts -t 'suggests'
cd backend && npx jest src/ask/ask.service.spec.ts -t 'rate limit'
```

Preview servers are declared in `.claude/launch.json` (`frontend-dev`, `frontend-preview`,
`backend-dev`) — start them with the preview tools, not Bash.

## Architecture

### Content layer is build-time code

Everything under `frontend/src/content/` is the single source of truth for site copy, and is
**imported by `vite.config.ts` and `vite-plugins/resume.ts` at build time**, outside the app's
module graph. So these modules may only import their siblings — no Vue, no `@` alias, no
`window`/`document`/`localStorage`/`navigator`. `src/content/__tests__/purity.spec.ts` enforces
this; violating it breaks `npm run build` with an error pointing at the résumé plugin instead of
the offending file. The résumé served at `/resume.txt` (and by the terminal's `curl`) is generated
from here, so the CV has exactly one source.

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
concatenates them and `registry.ts` builds the name/alias map. Adding a command means adding one
object — never a special case in the shell. A `Command` declares its own `hidden` (out of `help`
and Tab), `palette` (in Ctrl+K), `group`, and `complete(ctx)` for argument completion; the shell
handles prefix filtering, common-prefix insertion and ambiguity listing generically.

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

30 entries in `terminal/achievements.ts`, persisted under `couvbat:achievements` in
`localStorage`. `completionist` cascades off the other 29 and repaints the three.js palette.
Adding one means adding it to `achievementList` *and* the README's spoiler table.

### Backend: NestJS, one module per capability

`app.module.ts` wires ~10 feature modules, each `{controller, service, dto, spec}`. `main.ts`
carries the cross-cutting decisions and explains each in comments: helmet with a `default-src
'none'` CSP (JSON API, never a document), CORS locked to `FRONTEND_URL` + localhost,
`trust proxy` so the per-IP `common/rate-limit.guard.ts` sees real clients behind Apache, and a
whitelisting `ValidationPipe`.

**Everything optional degrades gracefully.** No Steam key → live activity hidden; no GitHub token
→ heatmap dropped; unreachable LLM → the terminal says it's asleep. `ask` and `guestbook` are
**off by default**. Endpoints report `configured: false` rather than erroring, and the frontend
renders that state. Preserve this when adding integrations. `backend/.env.example` documents every
variable and why the risky ones are off.

Privacy is a design constraint, not an afterthought: `/presence` pushes one integer over SSE with
no visitor id, `/stats` counts sessions not commands, `/weather` uses server-side coordinates so
every visitor gets the same answer, and `ask` never logs questions or answers.

### API base URL

`VITE_API_URL` is inlined by `vite build` — it must be set *where the build runs* (CI repository
variable), not next to the deployed `dist/`. `src/lib/api.ts` strips trailing slashes and falls
back to localhost **only in dev**; see the long comment there before touching it, it encodes two
previously-shipped bugs.

### Performance constraints worth not breaking

`ThreeBackground.vue` (~520 kB of three.js) is `defineAsyncComponent`'d, loaded on
`requestIdleCallback`, skipped entirely under `prefers-reduced-motion`, and **excluded from the PWA
precache** — with a runtime StaleWhileRevalidate rule instead. The API is deliberately absent from
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

Dependabot has no `target-branch` set, so its PRs open against the default branch (`master`),
bypassing `dev`. Set `target-branch: dev` in `.github/dependabot.yml` if they should follow the
same route.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
