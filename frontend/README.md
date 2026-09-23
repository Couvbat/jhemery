# frontend

The `jhemery.xyz` SPA — Vue 3 + Vite + Tailwind 4, bilingual (EN/FR), installable as a PWA.

For what the site *does* (commands, achievements, games, the three.js background), see the
[root README](../README.md). This file is about working on the code.

## Setup

Node ≥ 20.19 (or ≥ 22.12).

```bash
npm install
npm run dev          # http://localhost:5173
```

`.env.development` points `VITE_API_URL` at `http://localhost:3000`. The site runs fine with the
API down — the live cards say so instead of breaking.

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server, HMR, vue-devtools |
| `npm run build` | `type-check` + `build-only`, in parallel |
| `npm run build-only` | Production build without the type check |
| `npm run type-check` | `vue-tsc --build` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` |
| `npm run test:e2e` | Playwright — builds and serves `dist/` itself (`test:e2e:ui` for the UI mode) |
| `npm run lint` | `eslint .` — what CI runs (`lint:fix` rewrites) |
| `npm run lighthouse` | `lhci autorun` against the budgets in `lighthouserc.yml` |
| `npm run assets` | Regenerate PNG icons / og-image from their SVG sources |
| `npm run wordlists` | Regenerate the word-game lists (by hand, output committed — see the root README) |

## Layout

```
src/
  content/       plain-TS data: profile, projects, skills, music, gaming, hardware,
                 contact, sections, views. No Vue, no `@` alias, no side effects.
  terminal/      the shell: command registry, commands/, games/, vim editor,
                 achievements, output formatting, history, aliases
  tools/         the /tools page: registry.ts + one folder per tool (panel + pure .ts)
  rooms/         watch/radio: RoomPage, the two postMessage players, sync maths, useRoom
  components/    sections/, terminal/, effects/, ui/ (shadcn-vue via reka-ui), navbar,
                 palette, footer, toasts, ThreeBackground
  composables/   useTerminal, useTerminalShell, useViewSwing, useCrt, useMatrix, useBoot,
                 useSceneControl, useWeather, usePresence, useSteam, useGithub, …
  i18n/          locale ref + the message catalogue
  lib/           api client (`apiUrl`, typed fetchers), analytics, admin unlock, `cn()`
  router/        home, /tools/:tool?, /watch/:code?, /radio/:code?, 404
  views/         HomeView (all sections), ToolsView, WatchView, RadioView, NotFoundView
e2e/             Playwright specs + the `api` stub fixture
vite-plugins/
  resume.ts      emits the ANSI-coloured /resume.txt at build time
  third-party.ts emits /THIRD-PARTY.txt from the licences in node_modules
scripts/
  gen-assets.sh        SVG → PNG, run manually and committed
  build-wordlists.mjs  word-game lists, run manually and committed
```

`@` is aliased to `src/`.

### `src/content` is special

`vite.config.ts` and `vite-plugins/resume.ts` import these modules **at build time**, outside the
app's module graph. So content files must stay dependency-free: no Vue imports, no `@` alias, no
side effects. `src/content/__tests__/purity.spec.ts` enforces it.

Text that differs per language is `Localised<T>` (`{ en, fr }`); facts — specs, URLs, tech names —
stay plain strings. Resolve with `t()` from `useLocale()`, or `pick(value, locale)` outside a
component.

`src/content/sections.ts` is the single list of sections; the navbar, terminal `ls`/`cd`/`pwd`,
command palette and section headers all read from it. Add a section there and every surface picks
it up.

## The terminal

```
terminal/
  types.ts        Command, CommandContext, OutputLine, vim types
  registry.ts     name/alias lookup, tab completion, "did you mean" suggestions
  commands/       core · navigate · content · live · ask · eggs · system · tools · games/
  games/          pure state for the seven games, word lists, key stream, local high scores
  achievements.ts the 35 achievements, the localStorage store, toasts
  vimEditor.ts    pure state machine for the vim pane
  format.ts       line/blank/wrap/art helpers
```

### Adding a command

Append to one of the arrays in `src/terminal/commands/` — `commands/index.ts` concatenates them and
`registry.ts` indexes names and aliases. Nothing else to register.

```ts
{
  name: 'uptime',
  aliases: ['up'],
  usage: 'uptime',
  description: { en: 'How long this has been running', fr: 'Depuis quand ça tourne' },
  group: 'content',     // core | navigate | content | live | fun — sets the `help` heading
  hidden: false,        // true = runnable but absent from `help` and Tab completion
  palette: true,        // surface it in Ctrl+K
  run({ t }) {
    return [line(t({ en: 'a while', fr: 'un moment' }))]
  },
}
```

`run` gets a `CommandContext` — the interesting parts:

| | |
|---|---|
| `print(lines)` | Append progressively instead of returning at the end |
| `frame()` | Open a redrawable region; each draw replaces the previous one (animations, game boards) |
| `capture(handler)` | Hold the raw keyboard for longer than one line (the games). Auto-released when the command settles; modifier combos still reach `Ctrl+C` / `Ctrl+L` |
| `prompt(question, { mask })` | Ask for a line of input; rejects on `Ctrl+C` |
| `run(input)` | Run another command as if typed |
| `navigate(target)` / `close()` / `clear()` | Drive the overlay; `navigate` takes anything `cd` does and goes through `goTo()` |
| `effects` | `matrix`, `reboot`, `crt`, `vim`, `glitch`, `playMusic` |
| `signal` | `AbortSignal` — long-running commands must honour it |

Output is a list of `OutputLine`s of **plain text, never HTML** — commands render visitor-supplied
data (guestbook entries), so there is deliberately no markup escape hatch. Use `segments` for
per-run colouring, `pre` to preserve whitespace, `href` for links.

### Files, achievements

`commands/files.ts` is the fake filesystem shared by `ls`, `cat`, `vim` and `diff`, so a file
cannot show two different contents. `achievements.ts` exports `unlock(id)` and `announce(id, t)` — the latter
returns the toast lines to splice into your output. The `completionist` cascade is handled there.
A new achievement also needs a row in the root README's spoiler table.

### Adding a tool

One entry in `src/tools/registry.ts` (id, localised name and description, lazy panel) plus a
folder under `src/tools/<id>/` with the panel and a pure `.ts` holding the logic, tested in
`src/tools/__tests__/`. The page, `tools`, `ls tools`, `cd tools/<id>` and Tab all derive from the registry.
Nothing inside a view may be `position: fixed` — the prism swing transforms its ancestor.

## Performance notes worth preserving

- `ThreeBackground` is async, loaded on `requestIdleCallback`, skipped entirely under
  `prefers-reduced-motion`, and excluded from the PWA precache (~520 kB).
- `TerminalOverlay` — and behind it the whole command registry, guestbook client and vim editor —
  is only fetched the first time someone opens the terminal, then stays mounted.
- `MatrixRain` loads only when someone types `matrix`.
- The word lists are one `import()` chunk per locale, loaded by the first word game, and kept out
  of the precache.
- Each tool panel is its own chunk; the ffmpeg core (32 MB) is fetched only on an explicit click
  and its loader and worker are kept out of the precache.
- Lighthouse budgets in `lighthouserc.yml` are enforced on every PR (median of five runs).
- `og-image.*` is excluded from precaching; only crawlers fetch it and none run a service worker.
- The service worker is disabled in dev, where it would fight HMR.

## Tests

```bash
npm test             # vitest + jsdom
npm run test:e2e     # playwright
```

**Vitest** (`src/**/__tests__/`) owns behaviour: the command registry, every command, the games,
the tools' logic, i18n and the content-purity rule. A new assertion belongs here by default — it
runs in seconds.

**Playwright** (`e2e/`) owns only what jsdom structurally cannot reach: async chunks loading,
live-data failures degrading instead of throwing, section anchors scrolling a real viewport, and
`/resume.txt` and friends surviving the SPA fallback. It **never touches a real backend**: the
`api` fixture stubs every call against an unreachable origin, so a forgotten stub fails loudly.
Re-testing command behaviour through a browser is the thing to avoid.

## Building

```bash
npm run build        # → dist/
```

`VITE_API_URL` is read **by `vite build`** and inlined into the bundle as a literal — locally from
`frontend/.env`, in CI from the repository variable. Dropping a `.env` next to a deployed `dist/`
does nothing. Trailing slashes are stripped in `lib/api.ts`; the comment there explains why that
one character was worth a fix.

`VITE_UMAMI_SRC` and `VITE_UMAMI_WEBSITE_ID` are inlined the same way and point at the self-hosted
[Umami](https://umami.is) instance. Both unset — as they are in `.env.development` — means
`lib/analytics.ts` injects no tracker at all, so dev never reaches the dashboard. See
[docs/deploy.md](../docs/deploy.md#analytics-the-self-hosted-umami-at-umamijhemeryxyz).

Deployment (SSH, with a manual FTP fallback) lives in `.github/workflows/frontend-*.yml`.

## Editor setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar),
with Vetur disabled. TypeScript can't type `.vue` imports on its own, which is why `vue-tsc`
replaces `tsc` here and Volar is needed in the editor.
