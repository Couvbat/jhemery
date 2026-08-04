# backend

The `api.jhemery.xyz` service — NestJS 11, TypeScript. It backs the portfolio's live features:
the terminal's `ask`, the contact form, Steam and GitHub activity, and the guestbook.

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
| `GET /guestbook` | `guestbook` | Newest 25 entries. |
| `POST /guestbook` | `guestbook` | Sign. 1/min per IP. |
| `DELETE /guestbook/:id` | `guestbook` | Moderation; requires the `x-admin-password` header. |

Every optional integration degrades instead of erroring: no Steam key hides live activity, no
GitHub token drops the heatmap and pinned repos, an unreachable model makes the terminal say the
model is asleep and point at `mail`.

## Cross-cutting bits

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

## Tests

```bash
npm test          # guestbook service + controller, ask service + controller,
                  # contact service, rate-limit guard
npm run test:e2e
```

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
