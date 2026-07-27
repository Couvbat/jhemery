# Steam-backed game-log for the Gaming section

## Context

The "Game log terminal" card in
[`GamingSection.vue`](../../../frontend/src/components/sections/GamingSection.vue)
was a fake `game-log.txt` listing: a hardcoded array of six games with made-up
status strings ("Real Platinum God", "150+ hours", etc). It didn't reflect
anything real.

Goal: show real Steam activity — recently played games, actual playtime, and
live online/in-game status — in the same terminal-card look, without breaking
the card for visitors when Steam isn't configured or is unreachable.

## Decisions

- **No iframe embed.** Steam does not provide an official embeddable widget
  for a personal profile's recent activity (unlike the SoundCloud player used
  in the Music section). The only Steam-provided embeds are for store pages.
  Considered a third-party SVG-generator embed (the kind used in GitHub
  READMEs) but rejected: it wouldn't match the terminal theme and adds a
  dependency on an external service's uptime.
- **Approach: backend proxy to the Steam Web API.** New NestJS module
  `backend/src/steam` calls `ISteamUser/GetPlayerSummaries` (live status) and
  `IPlayerService/GetRecentlyPlayedGames` (recent games + playtime) using a
  server-side `STEAM_API_KEY`, so the key never reaches the browser. Mirrors
  the existing `contact` module's shape (module/controller/service +
  `ConfigService` for env vars).
- **SteamID input**: `STEAM_ID` env var accepts either a raw SteamID64 or a
  vanity profile name (e.g. `couvbat` from `steamcommunity.com/id/couvbat`).
  If it's not a 17-digit numeric string, the service resolves it once via
  `ISteamUser/ResolveVanityURL` and caches the resolved SteamID64 in memory
  for the process lifetime.
- **Caching**: successful responses are cached in-memory for 5 minutes
  (`CACHE_TTL_MS`) to avoid hammering the Steam API on every page load — no
  external cache/store, a portfolio site doesn't need one.
- **Graceful degradation over errors**: if `STEAM_API_KEY`/`STEAM_ID` are
  unset, the Steam API call fails, or the profile is private, the endpoint
  returns `{ configured: false }` with a 200 — never a 4xx/5xx. The frontend
  falls back to the original static game list. This was verified live: with
  no `backend/.env` present, the card renders identically to the old
  hardcoded version.
- **"Currently playing" signal**: `GetPlayerSummaries.gameextrainfo` (the
  game name Steam reports the player as actively in) is the source of truth,
  not a playtime heuristic — matched by name against the recent-games list.
- **Response shape**: kept deliberately small (`SteamActivity` /
  `SteamProfile` / `SteamRecentGame` in `steam.types.ts`) — just what the
  card renders, not a full passthrough of Steam's verbose API payload.

## Implementation

Backend (new `backend/src/steam/` module, registered in `app.module.ts`):

- `steam.types.ts` — `SteamActivity`, `SteamProfile`, `SteamRecentGame`,
  `SteamStatus` types shared between service and controller.
- `steam.service.ts` — `SteamService.getActivity()`:
  1. Reads `STEAM_API_KEY` / `STEAM_ID` from `ConfigService`; returns
     `{ configured: false }` immediately if either is missing.
  2. Returns the in-memory cache if still fresh.
  3. Resolves the SteamID64 (direct or via vanity-URL lookup).
  4. Fetches profile + recent games in parallel (`Promise.all`), maps Steam's
     raw JSON (typed via `ResolveVanityUrlResponse` /
     `PlayerSummariesResponse` / `RecentlyPlayedGamesResponse`) into the
     small `SteamActivity` shape, caches it, returns it.
  5. Any thrown error is caught, logged via `Logger.warn`, and converted to
     `{ configured: false }`.
- `steam.controller.ts` — `GET /steam/activity` → `SteamService.getActivity()`.
- `steam.module.ts` — wires controller + service, imports `ConfigModule`.
- `.env.example` — documents `STEAM_API_KEY` and `STEAM_ID`, with a comment
  pointing at `steamcommunity.com/dev/apikey` and explaining the vanity-name
  option.

Frontend (`GamingSection.vue`):

- On `onMounted`, `fetch(`${VITE_API_URL}/steam/activity`)` (same
  `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'` pattern as
  `ContactSection.vue`). Wrapped in try/catch that silently falls through to
  the static list on any failure.
- `displayGames` computed: if `steamGames` came back non-empty, maps each
  Steam game to `{ name, status }` where `status` is `'Currently playing'`
  when it matches `steamProfile.inGame`, otherwise a formatted playtime
  string (`formatPlaytime`: minutes → `"45m"` / `"3h"` / `"3.5h"`, preferring
  last-2-weeks playtime and falling back to total). Otherwise falls back to
  the original hardcoded `fallbackGames` array.
- When `steamProfile` is present, the card header line changes from "Recent
  activity log:" to "Live from Steam:", a status line is added (colored dot
  + persona name + `in-game: X` or persona status), and a "view full steam
  profile ↗" link to `steamProfile.profileUrl` is appended below the log —
  all additive, the existing per-row markup (▸ marker, name, status badge)
  is unchanged.

## Error handling

- Backend: every external Steam call is wrapped so a failure anywhere in the
  chain (missing config, network error, resolve-vanity failure, private
  profile) collapses to the same `{ configured: false }` response — the
  frontend doesn't need to distinguish failure modes.
- Frontend: fetch failure (network error, non-2xx, JSON parse error) is
  caught and ignored; `steamGames`/`steamProfile` simply stay `null` and
  `displayGames` renders `fallbackGames`. No error UI, no retry — consistent
  with the "accepted limitation" stance taken for the SoundCloud embed.

## Verification

- `npx tsc -p tsconfig.build.json --noEmit` and `npx eslint src/steam` clean
  in `backend/`.
- `npm run build` (type-check + vite build) clean in `frontend/`.
- Manual: ran the NestJS dev server with no `backend/.env`, confirmed
  `GET /steam/activity` returns `{"configured":false}`; loaded the site in
  the browser preview and confirmed the Gaming section's game-log card
  renders exactly the original static list with no console errors.
- Not yet verified: the `configured: true` path (real Steam data rendering),
  since it requires a live `STEAM_API_KEY` / `STEAM_ID` that the site owner
  hasn't provisioned yet. Should be re-checked manually once `backend/.env`
  is filled in.

## Out of scope

- Third-party SVG-embed fallback (e.g. Vercel-hosted "recently played"
  generators) — rejected in favor of the backend proxy, noted above.
- Persistent/external caching (Redis, etc.) — in-memory 5-minute cache is
  enough for a low-traffic portfolio site.
- Historical/long-term playtime charts or a full game library view — only
  the last few recently-played games + live status, matching the card's
  original scope.
