# backend

The `api.jhemery.xyz` service — NestJS 11, TypeScript. It backs the portfolio's live features:
the terminal's `ask`, the contact form, Steam and GitHub activity, weather, crypto quotes, live
presence, the session counter, the guestbook, the watch/radio rooms and the owner-only downloader.

For the site itself, see the [root README](../README.md).

## Setup

```bash
npm install
cp .env.example .env
npm run start:dev          # http://localhost:3000
```

`.env.example` documents every variable, including why the risky ones ship disabled. Nothing is
required to boot: with an empty `.env` the API starts and every optional feature reports itself as
unconfigured rather than failing.

| Script | Does |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run start:prod` | `node dist/main` |
| `npm run build` | `nest build` → `dist/` |
| `npm run lint` | `eslint --fix` |
| `npm test` | Jest unit tests |
| `npm run test:e2e` | Jest e2e (`test/jest-e2e.json`) |
| `npm run test:cov` | Coverage |

## Modules and routes

| Route | Module | Notes |
|---|---|---|
| `POST /ask` | `ask` | SSE stream of an answer from a self-hosted, OpenAI-compatible model. 5/hour per IP. |
| `POST /contact` | `contact` | Sends the terminal's `mail` message over SMTP. 2 per hour per IP. |
| `GET /steam/activity` | `steam` | Profile + recently played, 5-minute cache. |
| `GET /github/activity` | `github` | Recent public commits, 5-minute cache. |
| `GET /github/contributions` | `github` | Contribution heatmap — GraphQL, needs a token. |
| `GET /github/pinned-repos` | `github` | Pinned repos — GraphQL, needs a token. |
| `GET /github/workflow-status` | `github` | Four latest Actions runs for `GITHUB_REPO`; public REST, token optional. 60 s cache. |
| `GET /weather` | `weather` | Open-Meteo for the coordinates in config (never the caller's). 10-minute cache. |
| `GET /markets` | `markets` | CoinGecko quotes + 7-day series for `MARKETS_COINS`. 5-minute cache. |
| `GET /presence` | `presence` | SSE: one integer, the number of open connections. 25 s heartbeat. |
| `GET /stats` | `stats` | `{ sessions }` — terminal sessions ever opened. |
| `POST /stats/session` | `stats` | Count one session. 5/hour per IP. |
| `GET /guestbook` | `guestbook` | Newest 25 entries. |
| `POST /guestbook` | `guestbook` | Sign. 1/min per IP. |
| `DELETE /guestbook/:id` | `guestbook` | Moderation; requires the `x-admin-password` header. |
| `GET /rooms` | `rooms` | `{ enabled }` — the feature flag, so the pages can say so. |
| `POST /rooms` | `rooms` | Create a `watch` or `radio` room; returns the code and the host token. 10/hour per IP. |
| `GET /rooms/:code` | `rooms` | Snapshot: state, queue, member count. |
| `GET /rooms/:code/events` | `rooms` | SSE of the same snapshot on every change, plus a 25 s heartbeat. Subscribing *is* membership. |
| `POST /rooms/:code/state` | `rooms` | Host only (`x-room-token`): media, position, playing, queue. 120/min per IP. |
| `DELETE /rooms/:code` | `rooms` | Host only: ends the room for everyone. |
| `GET /jobs` | `jobs` | Admin only (`x-admin-password`): `{ configured, jobs }`. Doubles as the frontend's password check. |
| `POST /jobs` | `jobs` | Admin only: start a yt-dlp job for one video or one track. 202 with the job. 20/hour per IP. |
| `GET /jobs/:id` | `jobs` | Admin only: poll. |
| `GET /jobs/:id/file` | `jobs` | Admin only: the mp3, streamed once and then deleted. |
| `DELETE /jobs/:id` | `jobs` | Admin only: cancel a running job, or dismiss a finished one. |

Every optional integration degrades instead of erroring — endpoints report `configured: false` (or
`enabled: false`) and the frontend renders that state: no Steam key hides live activity, no GitHub
token drops the heatmap and pinned repos, no weather coordinates hide `weather`, an unreachable
model makes the terminal say the model is asleep and point at `mail`. `ask`, `guestbook`, `rooms`
and `jobs` are **off by default**.

Privacy is a constraint on every module, not a policy on top: `/presence` pushes one integer with
no visitor id, `/stats` counts sessions rather than commands, `/weather` uses server-side
coordinates so everyone gets the same answer, and `ask` never logs questions or answers.

## Cross-cutting bits

**Helmet** sets a `default-src 'none'` CSP — this is a JSON API, never a document.

**CORS** is limited to `localhost:5173` plus `FRONTEND_URL`, methods `GET`/`POST`/`DELETE`, and
allows the `x-admin-password` header — without which the guestbook DELETE preflight fails in the
browser.

**`trust proxy`** is on: Apache fronts the app, so `req.ip` must come from `X-Forwarded-For` or the
rate limiter would see one client (the proxy) for the whole internet.

**Validation** is a global `ValidationPipe({ whitelist: true })`; DTOs use `class-validator`.

**Rate limiting** is `common/rate-limit.guard.ts` — a per-IP fixed window held in memory, applied
per handler with `@RateLimit({ limit, windowMs })`. Adequate for one low-traffic Node process
behind Passenger; scaling out would need Redis or the platform's own limiter.

## `ask`

Disabled unless `ASK_ENABLED=true`. It is the only endpoint that opens a path towards a home
network, and it spends a private machine's electricity, so it is opt-in by design.

- Works with any OpenAI-compatible runtime — Ollama, llama.cpp, vLLM, LM Studio. Point
  `LLM_BASE_URL` at whatever has `/chat/completions` under it.
- Grounded on `https://jhemery.xyz/llms.txt`, cached for an hour, capped at 16k chars, with a
  built-in fallback corpus. **The corpus never blocks an answer** — a cold or unreachable fetch is
  skipped, not awaited.
- Budgets: ~300 output tokens, 20 s to the first token (then it detaches and lets the model warm
  up in the background), 15 s idle timeout, and a 45 s structural silence ceiling in the
  controller.
- `reasoning_effort: 'none'` is sent — a reasoning model otherwise spends the entire token budget
  deliberating and the answer arrives truncated mid-sentence.
- Streamed by writing SSE to the response directly rather than via `@Sse()`, which is built around
  `Observable` and `GET`; this is a `POST` with a body. `X-Accel-Buffering: no` stops Apache
  holding the whole answer back.
- Questions and answers are never logged.

The 45-second ceiling exists because Cloudflare gives the origin 100 s to produce headers and then
serves its own 524 — a page with no `Access-Control-Allow-Origin`, so a hang reads in the browser
as a CORS failure on an endpoint that is configured perfectly. Answering late is better than
letting a proxy answer.

## `guestbook`

Disabled unless `GUESTBOOK_ENABLED=true` — it is a publicly writable field.

- Entries are sanitised and link-filtered (the single highest-signal spam heuristic), rate-limited
  to 1/min per IP, and capped at 500 with oldest-first eviction.
- Storage is a JSON file under `DATA_DIR` (default `uploads`, excluded from the deploy so entries
  survive it), or MongoDB when `MONGODB_URI` is set.
- Writes are serialised through a queue and written via rename, so two concurrent signings can't
  clobber each other.
- `DELETE /guestbook/:id` refuses outright unless `ADMIN_PASSWORD` is set.

## `rooms`

Disabled unless `ROOMS_ENABLED=true` — a public endpoint that holds a connection per guest and
relays what a host loads to everyone in the room.

- In memory: a `Map` of rooms and an RxJS `Subject` each. 200 rooms at most, each gone two hours
  after its last host action or arrival/departure; a restart empties them all, by design.
- What a host may load is an allowlist per kind, checked in the service, not a sanitiser: eleven
  characters from YouTube's id alphabet for `watch`, an https URL on `soundcloud.com` for `radio`.
  The string ends up as an iframe `src` on every member's page, which is why the host's own page
  is not trusted to have checked it.
- A room knows nothing about its members but how many there are — the `/presence` rule. The host
  token is random, compared in constant time, returned once at creation and never again.
- Playback state carries the server clock (`at`); a bare `{ playing: false }` pauses where the item
  actually is, because the position is recomputed to now rather than copied.

## `jobs`

Disabled unless `DOWNLOADER_ENABLED=true` — it spawns a process on a shared host and writes to
disk. Every route is behind `AdminGuard` (`x-admin-password` against `ADMIN_PASSWORD`, constant
time, unset means locked).

- A download is a **job, not a request**: `POST` returns at once with an id, the page polls, the
  file is streamed exactly once and deleted. A request that waited for yt-dlp would die at
  Passenger's timeout and come back from Cloudflare as a 524 — the wall `ask` already hit.
- The runner is what the shell check in `docs/deploy.md` found, as defaults: `~/ytdlp/bin/yt-dlp`
  (the venv; the PyInstaller binary cannot run because `/tmp` is `noexec`), `~/bin` for the static
  ffmpeg, and the app's own `process.execPath` as yt-dlp's JS runtime (YouTube wants one). Each
  is an env var when the box differs. `TMPDIR` is moved under `DATA_DIR` for the same `noexec`
  reason.
- What it will fetch is an allowlist of URL shapes (`jobs.urls.ts`): one YouTube video, one
  SoundCloud track. Never a set or a profile — yt-dlp walks those, hundreds of requests in a
  minute, and that earned the host's IP an hour-long 403 during the check.
- One job runs at a time, three may be pending, ten minutes each, 200 MB at most, files gone
  30 minutes after they are produced if never fetched, the whole `DATA_DIR/jobs` emptied on boot.
- Progress is read from yt-dlp's own `[download] 42.7%` lines; a failure keeps its last `ERROR`
  line, never the whole log.

## Tests

```bash
npm test          # jest — a *.spec.ts beside each service, controller and guard
npm run test:e2e  # test/jest-e2e.json
npx jest src/ask/ask.service.spec.ts -t 'rate limit'   # one file, one test
```

CI (`backend-pr-check.yml`) runs `lint`, `test` and `build` on every PR into `dev` or `master`.

## Deployment

cPanel + CloudLinux Passenger; `.htaccess` in this directory is the Passenger config and its
generated blocks must not be edited by hand.

- `.github/workflows/backend-deploy.yml` — the default path. Whitelists the runner's IP through
  the cPanel API, ships over SSH, and installs dependencies on the server.
- `.github/workflows/backend-deploy-ftp.yml` — manual fallback for when the cPanel API is
  unavailable. No SSH, so a lockfile change needs "Run NPM Install" in cPanel afterwards; the job
  summary says so when it detects one.

Production `.env` lives on the server, not in this repo — a self-hosted LLM endpoint usually has no
auth of its own, and the per-route limiter guards this API, not the model behind it.
