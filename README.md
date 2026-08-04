# jhemery.xyz

Personal portfolio of **Jules Hémery** (*Couvbat*) — a terminal-flavoured single-page site with a
wireframe three.js background, a real command shell you can type into, two playable games, and 21
hidden achievements.

Vue 3 + Vite + Tailwind on the front, NestJS on the back, bilingual (EN/FR) throughout.

```
frontend/   Vue 3 SPA — sections, terminal, games, achievements, PWA
backend/    NestJS API — ask, contact, steam, github, guestbook
docs/       design specs and implementation plans
.github/    build / PR-check / deploy workflows (SSH + FTP fallback)
```

---

## Table of contents

- [The page](#the-page)
- [The terminal](#the-terminal)
- [Commands](#commands)
- [Games](#games)
- [Achievements](#achievements)
- [The API](#the-api)
- [Running it locally](#running-it-locally)
- [Tests](#tests)
- [Deployment](#deployment)

---

## The page

| Feature | Notes |
|---|---|
| **three.js background** | 18 wireframe polyhedra (icosahedron, torus, box, octahedron, tetrahedron, dodecahedron) drifting in rotation, three of them cyan and the rest neon green, picked up from the CSS custom properties `--neon-green` / `--neon-cyan`. The camera eases towards the pointer for a parallax tilt. |
| — performance | The whole component is `defineAsyncComponent`'d and only loaded on `requestIdleCallback`, so ~520 kB of three.js never competes with first paint. It is excluded from the PWA precache for the same reason. |
| — accessibility | `prefers-reduced-motion` skips loading it entirely; WebGL failures are caught and the canvas is simply left blank. Geometries, materials and the renderer are disposed on unmount. |
| **CRT overdrive** | `crt` in the terminal (or the Konami code anywhere on the page) toggles scanlines, flicker and a speed multiplier that the three.js loop reads live to spin the wireframes up. Persisted in `localStorage`. |
| **Boot sequence** | A fake `couvsh 1.0` kernel log plays on first visit, then remembers it booted. Skipped for reduced-motion. |
| **Sections** | about · projects · music · gaming · hardware · contact — defined once in `src/content/sections.ts` and consumed by the navbar, the terminal's `ls`/`cd`/`pwd`, the command palette and every section header. |
| **Live cards** | Steam "currently playing", GitHub recent commits, contribution heatmap and pinned repos, SoundCloud player, guestbook. |
| **Command palette** | `Ctrl/⌘+K` — fuzzy list of sections and palette-flagged commands, arrow-key navigable with the selection kept in view. |
| **Matrix rain** | `matrix` follows the white rabbit; the effect component is lazy-loaded on demand. |
| **i18n** | English and French, detected from `navigator.language`, overridable with the navbar toggle or `lang en|fr`, persisted in `localStorage`. All content and every terminal string is `Localised<T>`. |
| **PWA** | Installable, `autoUpdate` service worker, maskable icons, offline navigation fallback. |
| **`curl jhemery.xyz`** | A real ANSI-coloured `resume.txt` is generated at build time from `src/content` by a Vite plugin, so the résumé has exactly one source. |

## The terminal

Open it with the **`` ` ``** key anywhere (or **`` Ctrl+` ``** from inside a form field), or the
`>_ terminal` button bottom-right. Desktop only — a fixed input panel loses to mobile virtual
keyboards, and the rendered page carries the same content anyway.

| Key | Does |
|---|---|
| `Tab` | Completion over every visible command and alias, longest-common-prefix style |
| `↑` / `↓` | Command history (persisted) |
| `Ctrl+L` | Clear |
| `Ctrl+C` | Cancel a running command |
| `Esc` | Close the overlay (focus returns where it started) |
| traffic lights | The title-bar dots actually close / minimise / maximise |

Unknown commands get a Levenshtein "did you mean …?" suggestion. `help` groups commands into
*shell · navigation · content · live data · misc* and says only that "not everything is listed
here" — `help --all` gives up the 14 hidden ones.

**vim.** `vim` (or `vi`, `nvim`, `emacs`) opens a real modal editor pane: normal/insert modes,
`hjkl` + arrows, `i`/`a`/`A`/`o`, `x`, `dd`, and yes, `:q!` gets you out. `cat` and `vim` read from
the same fake filesystem, so a file can never show two different contents.

## Commands

### shell

| Command | Aliases | Usage |
|---|---|---|
| `help` | `?`, `man` | `help [command] [--all]` — list commands, or explain one |
| `clear` | `cls` | Clear the screen |
| `history` | | Show command history |
| `echo` | | `echo <text>` |
| `date` | | Current date |
| `whoami` | | Print the current user |
| `lang` | | `lang [en|fr]` — show or switch language |
| `exit` | `quit`, `logout` | Close the terminal |

### navigation

| Command | Usage |
|---|---|
| `ls` | `ls [-a]` — list sections and files (`-a` shows more than you were meant to see) |
| `cd` | `cd <section>` — scrolls the page there; accepts English ids and French labels |
| `pwd` | Print the current section |
| `cat` | `cat <file>` — `about.txt`, `skills.txt`, `contact.txt`, guestbook entries, … |
| `open` | `open <github|linkedin|soundcloud|steam|email>` |

### content

| Command | Aliases | Does |
|---|---|---|
| `about` | `bio` | Who I am |
| `skills` | | Tech I work with |
| `projects` | | What I have built — `projects --json` for the machine-readable form |
| `music` | | What I produce |
| `gaming` | | What I play |
| `hardware` | | `hardware [pc|nas|peripherals]` |
| `contact` | `links` | How to reach me |
| `neofetch` | `fetch` | System summary, ASCII logo and an "uptime" counted from the first commit |
| `resume` | `cv` | Condensed résumé |
| `curl` | | `curl jhemery.xyz` — fetches the résumé the way a real curl would |

### live data

| Command | Aliases | Does |
|---|---|---|
| `steam` | `playing` | Live Steam activity |
| `gitlog` | `git log`, `commits` | Recent public commits |
| `guestbook` | `gb` | Read what visitors left (entries are listed as files you can `cat`) |
| `sign` | | `sign <message>` — leave a message |
| `mail` | `sendmail`, `write` | Send me a message without leaving the terminal |
| `ask` | | `ask <question>` — streams an answer from a self-hosted LLM |

### misc

Playable: `games` / `arcade`, `2048`, `snake`, `play` (starts the music player).

Hidden — not in `help`, only in `help --all`: `sudo`, `matrix`, `crt`, `vim` (`vi`/`nvim`/`emacs`),
`:q` (`:q!`/`:wq`/`:x`/…), `hack`, `coffee` (`brew`), `cowsay`, `fortune`, `sl`, `rickroll`,
`uname`, `ps` (`ps aux`/`ps -ef`), `top` (`htop`).

## Games

Both run inside the terminal buffer, take over the keyboard while they're live, and are cancellable
with `Ctrl+C`. High scores are kept per game in `localStorage` and shown by `games`.

- **`2048`** — slide tiles and merge them. Arrows or `wasd`, `r` restarts, `q` quits.
- **`snake`** — eat, grow, mind the walls. Same keys; reduced-motion players get one step per
  keypress instead of a ticking clock.

## Achievements

21 in total, tracked in `localStorage` (`couvbat:achievements`, plus `couvbat:achievements:sections`
for the exploration one). Unlocking one fires a floating toast and prints a line in the terminal;
the trophy button in the navbar opens a modal listing all 21. Locked ones show `???` and an oblique
hint; unlocking one reveals its title and how it was done. `achievements` (alias `trophies`) prints
the same progress in the terminal.

The last one cascades: unlock the other twenty and **100%** unlocks itself.

| Achievement | How to get it |
|---|---|
| Read the Manual | `ls -a`, then `cat .secret` |
| Grand Tour | `cd` into every section |
| Kilroy Was Here | Sign the guestbook with `sign <message>` |
| You've Got Mail | Send a message with `mail` |
| Turing Test | Get an answer out of the local model with `ask` |
| Bilingual | Switch language with `lang` |
| Script Kiddie | Run `sudo rm -rf /` |
| Vi Improved | Escape vim with `:q!` |
| Red Pill | `matrix` — follow the white rabbit |
| 1337 h4x0r | `hack` the mainframe |
| Bovine Wisdom | `cowsay <text>` |
| Fortune Cookie | `fortune` |
| Choo Choo | Typo `ls` into `sl` |
| I'm a Teapot | `coffee` |
| Never Gonna | `rickroll` |
| CRT Overdrive | Toggle `crt` |
| Task Manager | Watch `htop` |
| Cheat Code | Enter the Konami code (↑↑↓↓←→←→BA) anywhere on the page — no terminal needed |
| Tile Merchant | Reach a 256 tile in `2048` |
| Nokia Nostalgia | Grow a snake to length 10 in `snake` |
| 100% | Unlock everything else |

Hints are deliberately oblique in the modal; the table above is the spoiler version.

## The API

NestJS, CORS-locked to `FRONTEND_URL`, global validation pipe, `trust proxy` set so the per-IP rate
limiter sees real clients behind Apache.

| Route | Purpose |
|---|---|
| `POST /ask` | Proxies an OpenAI-compatible runtime (Ollama, llama.cpp, vLLM, LM Studio). 5 questions/hour per IP, one in flight globally, ~300 output tokens, 20 s timeout. Questions and answers are never logged. Disabled by default. |
| `POST /contact` | Sends the `mail` command's message over SMTP (logs only, in dev). |
| `GET /steam/activity` | Currently-playing / recently-played, via the Steam Web API. |
| `GET /github/activity` | Recent public commits. |
| `GET /github/contributions` | Contribution heatmap (GraphQL — needs a token). |
| `GET /github/pinned-repos` | Pinned repositories (GraphQL — needs a token). |
| `GET /guestbook` · `POST /guestbook` | Read and sign. Sanitised, link-filtered, 1/min per IP, capped at 500 entries. Stored in a JSON file under `DATA_DIR`, or in MongoDB if `MONGODB_URI` is set. Disabled by default. |
| `DELETE /guestbook/:id` | Moderation; requires the `x-admin-password` header. |

Everything optional degrades gracefully: no Steam key hides live activity, no GitHub token drops the
heatmap, an unreachable model makes the terminal say it's asleep and point at `mail`.

See `backend/.env.example` — it documents every variable, including why the risky ones are off by
default.

## Running it locally

Node ≥ 20.19 (or ≥ 22.12).

```bash
# frontend — http://localhost:5173
cd frontend
npm install
npm run dev

# backend — http://localhost:3000
cd backend
npm install
cp .env.example .env
npm run start:dev
```

`frontend/.env.development` already points `VITE_API_URL` at `http://localhost:3000`. The site works
with the API down — the live cards just say so.

Other scripts:

```bash
npm run build        # frontend: type-check + production build
npm run type-check   # vue-tsc
npm run assets       # regenerate favicons / PWA icons / og-image

npm run build        # backend: nest build
npm run lint         # eslint --fix
```

## Tests

```bash
cd frontend && npm test    # vitest — terminal registry, games, ask streaming, i18n, content purity
cd backend  && npm test    # jest — guestbook, ask, contact, rate-limit guard
cd backend  && npm run test:e2e
```

## Deployment

GitHub Actions, split per app and path-filtered:

- **PR checks** (`*-pr-check.yml`) run on every PR to `master`.
- **Build** (`*-build.yml`) runs on `master` pushes.
- **Deploy** (`*-deploy.yml`) uses the cPanel API to whitelist the runner's IP, then ships over SSH —
  the backend installs its dependencies on the server.
- **FTP fallback** (`*-deploy-ftp.yml`) is manual-only, for when the cPanel API is unavailable. No
  SSH there, so a lockfile change needs "Run NPM Install" in cPanel afterwards; the job summary says
  so when it detects one.

## Docs

`docs/superpowers/` holds the design specs and implementation plans behind the bigger pieces — the
three.js wireframe background, the vim pane, the terminal games, the achievements UI, the SoundCloud
embed, and a CTF flag chain that is still just a design.
