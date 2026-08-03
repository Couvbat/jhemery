# GitHub recent-commits card for the Projects section

Status: implemented (PR #3, `a0b0808`). The contribution heatmap and pinned-repos cards that share
this module landed later; heatmap width was fixed in PR #8 (`22e646b`).

## Context

Following the same real-data pattern as the SoundCloud embed and the Steam
game-log integration, the Projects section
([`ProjectsSection.vue`](../../../frontend/src/components/sections/ProjectsSection.vue))
had no live activity — just the static project grid. Goal: add a small
"recent commits" terminal card showing real, recent GitHub activity, using
the same backend-proxy-with-graceful-fallback approach as the Steam card.

## Decisions

- **Backend proxy, no secrets required by default.** New NestJS module
  `backend/src/github`, same module/controller/service shape as `steam`
  and `contact`. Unlike Steam, GitHub's public data needs no API key at
  all — only `GITHUB_USERNAME` is required; an optional `GITHUB_TOKEN` just
  raises the rate limit (60/hr unauthenticated is enough for a 5-minute
  cache on a low-traffic site, but Search API specifically is capped at
  10 req/min unauthenticated vs 30 authenticated, so a token is a nice-to-have
  if that becomes a problem).
- **Data source: the commit *search* API, not the events API.** Originally
  built against `GET /users/{username}/events/public` (`PushEvent`
  payloads), matching the initial plan of showing recent pushes. Discovered
  live that GitHub no longer includes a `commits` array on `PushEvent`
  payloads — it's `null` — so every event surfaced zero usable commits.
  Switched to `GET /search/commits?q=author:{username}&sort=committer-date`,
  which returns full commit objects (message, sha, repository, dates)
  directly. Verified against the real `Couvbat` account before considering
  this done — the events-API version silently "worked" (200 OK, `configured:
  true`) while returning an empty list, which would have shipped as a
  broken feature that only fails visually, not in logs.
- **Private-repo filtering**: results are filtered to `!repository.private`
  before being returned, regardless of whether `GITHUB_TOKEN` has broader
  access — the portfolio is public, so private repo names/commit messages
  must never reach the response even if the configured token could see them.
- **No fallback content — hide instead.** Unlike the Steam card (which had
  a pre-existing static mock to fall back to) or the Projects grid itself,
  there's no natural "fake commit log" to show. When unconfigured or the
  fetch fails, the whole card is simply not rendered
  (`v-if="githubCommits && githubCommits.length"`), rather than inventing
  placeholder commits.
- **Placement**: a full-width terminal card below the existing project
  grid, inside the same `#projects` section — reuses the exact
  dots-+-titlebar chrome pattern from the Steam/Music cards
  (`git log --oneline` as the "filename").
- **Row content**: short sha, first line of commit message (truncated to 72
  chars), short repo name (without the `owner/` prefix — the whole portfolio
  is already "Couvbat's", so the owner is redundant), and relative time
  (`Xm/Xh/Xd ago`) hidden on narrow screens. Each row links to the commit's
  `html_url`.
- **Caching**: 5-minute in-memory cache, same TTL and same reasoning as
  Steam — no external cache needed for this traffic level.

## Implementation

Backend (new `backend/src/github/` module, registered in `app.module.ts`):

- `github.types.ts` — `GithubCommit` (`repo`, `sha`, `message`, `url`,
  `date`), `GithubActivity` (`configured`, `commits?`).
- `github.service.ts` — `GithubService.getActivity()`: returns
  `{ configured: false }` if `GITHUB_USERNAME` is unset; otherwise returns
  the in-memory cache if fresh, or calls `fetchRecentCommits()` (hits the
  commit-search endpoint, typed via `CommitSearchResponse`, filters out
  private repos, maps to `GithubCommit[]`, caps at 6), caches, and returns.
  Errors are caught, logged, and converted to `{ configured: false }`.
- `github.controller.ts` — `GET /github/activity`.
- `github.module.ts` — wires controller + service, imports `ConfigModule`.
- `.env.example` — documents `GITHUB_USERNAME` (required) and `GITHUB_TOKEN`
  (optional, blank by default).

Frontend (`ProjectsSection.vue`):

- On `onMounted`, `fetch(`${VITE_API_URL}/github/activity`)`, same pattern
  as the other sections. On success with a non-empty `commits` array, sets
  `githubCommits`; any failure is caught and ignored, leaving it `null`.
- `shortRepo()` strips the `owner/` prefix; `relativeTime()` formats the ISO
  date as `Xm/Xh/Xd ago`.
- Template: the card only renders when `githubCommits` is non-empty,
  placed directly below the existing project-card grid inside the same
  section container.

## Error handling

Same posture as Steam: any failure anywhere in the backend chain (missing
config, network error, non-2xx from GitHub) collapses to
`{ configured: false }`; the frontend fetch failure is caught and ignored.
No error UI, no retry. The one addition here is hiding the card entirely
on empty/failed data rather than falling back to static content, since none
exists for this card.

## Verification

- `npx tsc -p tsconfig.build.json --noEmit` and `npx eslint src/github`
  clean in `backend/`.
- `npm run build` (type-check + vite build) clean in `frontend/`.
- Manual, with real `GITHUB_USERNAME=Couvbat` and no token: confirmed
  `GET /github/activity` returns real recent commits from the account's
  public repos (verified message/sha/repo/date all populate correctly)
  and the card renders live in the browser under the Projects grid with no
  console errors.
- Caught and fixed the events-API dead end (see Decisions) before
  considering this verified — a `configured: true` response with an empty
  `commits` array would have looked "done" without live data.

## Out of scope

- Showing pull requests, issues, or stars — commits only, matching the
  narrow "git log" framing of the card.
- Per-repo grouping or a full contribution graph — a flat recent-commits
  list, matching the Steam card's flat recent-games list.
- Search-API rate-limit handling beyond the 5-minute cache (e.g. exponential
  backoff, queuing) — not worth it at this traffic level; a stale/failed
  fetch just hides the card until the next successful poll.
