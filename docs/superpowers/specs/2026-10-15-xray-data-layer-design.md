# Design spec — x-ray, the data layer: where every live number came from

Status: proposed, not built. Extends §I's *X-ray mode* (#151), which tags each component with
the file that drew it and the content modules its words come from. This adds what that layer
can't see: the live data. Independent of the other lab specs, except that the request path's last
two hops read [the lab map](2026-10-15-lab-map-design.md)'s snapshot and are left out until it
ships.

## Context

Goal: let x-ray show, for every live widget, which API route fed it, how long that took and how
old the server's copy was, and the path this visit's requests took to the site, its API and the
lab.

The page reads the API in a handful of places: the gaming section (Steam), the projects section
(pinned repos), the heatmap, the build-status card, the contact section, the footer, the
guestbook ticker, and the background (presence, signatures). X-ray says
`GamingSection.vue · content: gaming` and stops there. `strace` shows requests, but only a
command's, and only while it watches. Neither answers the question a peer asks first about a live
number: *where does this come from, and how fresh is it?* The site makes claims about its
requests (`/privacy`, `strace`'s "shape, never values"); this makes the timing side visible.

Three parts: naming each element's route, timings that don't touch `request()`, and the request
path.

## 1. Which route fed which element

- A component that renders API data says so on its root: `data-api="/steam/activity"`, several
  routes separated by spaces. It is a literal attribute in the template, not a build transform:
  the component knows which `api.*` call feeds it, and the compiler doesn't.
- `lib/xray-stamp.ts` gains `API_ATTR = 'data-api'` beside `SRC_ATTR`.
- **A source-scan spec**, in the manner of `storage-keys.spec.ts`: every `.vue` file under
  `components/` and `views/` that imports `@/lib/api` or one of the data composables (`useSteam`,
  `useGithub`, `useWeather`, `usePresence`, `useGuestbookTicker`, `useStats`, `useStatus`, and the
  lab's `api.lab()` once it exists) must carry `data-api`, and every route it names must appear in
  `lib/api.ts`. `XrayLayer.vue` is exempt, being the reader. So a new live widget can't ship
  untagged.
- In the layer, an element with `data-api` gets a second line under its file tag:
  `GET /steam/activity · 84 ms · server copy 3 min old`.

## 2. Timings, without touching `request()`

`request()`'s fast path is deliberate: with nobody watching, every request takes exactly the path
it took before `strace` existed. X-ray turns on after the page's requests have happened, so the
observer could not help anyway. The browser has already recorded them.

- **Resource Timing.** `performance.getEntriesByType('resource')` lists every fetch with its URL,
  start and duration. A cross-origin entry keeps its `duration` without any permission, so the
  milliseconds are available today.
- **What needs permission** is the rest: `transferSize`, `encodedBodySize` and `serverTiming`
  read as zero across origins unless the response carries `Timing-Allow-Origin`. The API adds
  `Timing-Allow-Origin` naming `FRONTEND_URL` (and the dev origin, as CORS does), from one small
  middleware in `main.ts` beside helmet. It exposes timing to the site's own origin only.
- **Server-Timing.** Each route that serves a cached upstream answers with
  `Server-Timing: cache;desc="hit", age;dur=180000` (milliseconds since the upstream fetch), or
  `cache;desc="miss", upstream;dur=812`. The age is the same number `/health` already reports
  through `cacheAge()`, so it costs no upstream call. A helper `serverTiming(res, { … })` in
  `common/` formats it, and each caching controller sets it with `@Res({ passthrough: true })`:
  steam, the four github routes, weather, markets, health, and lab once it exists.
- **Nothing about the visitor is in either header.** They carry cache ages and durations, and the
  `strace` rules are untouched, since nothing new is fed to the request observer.
- **Reading them**, in a pure `lib/xray-data.ts`: strip `apiUrl` from each entry's name, drop the
  query, keep the newest entry per route, and format milliseconds, size and age in both locales.
  The presence stream has no finished entry while it is open, so its line reads *stream · open*
  from `usePresence`'s own state.
- **The buffer.** Browsers keep 250 resource entries by default, and the ticker's 20 s poll adds
  three a minute, so a long visit fills it and new entries are dropped. `main.ts` clears the
  buffer on `resourcetimingbufferfull`: x-ray only ever wants the newest entry per route, and a
  poll puts its route back within one interval. The listener costs a few bytes on the eager
  chunk, and the layer reads with a `PerformanceObserver` started `buffered: true` when it opens.

## 3. The request path

A panel in the layer, in a corner like the canvas tag, titled *this visit's path*, opened from a
button in the layer or by `xray path`. One ordered list of hops:

1. **you → Cloudflare, colo `CDG`, HTTP/3, TLS 1.3.** From `/cdn-cgi/trace`, which is on this
   origin, so the CSP's `connect-src 'self'` already admits it, fetched through `fetchSite()` so
   `strace` sees it. The response also carries the visitor's IP and country. **`parseTrace()`
   keeps `colo`, `http` and `tls` and drops every other line before anything stores or renders
   it**, because screens get shared, which is the rule that keeps `du ~` from printing secrets. A
   spec holds it to returning exactly those three keys. In dev, with no Cloudflare in front, the
   hop reads *not behind Cloudflare here*.
2. **Cloudflare → o2switch, static files.** A fact, from content.
3. **the API: Cloudflare → o2switch, Passenger → NestJS**, with the newest API round trip from
   part 2 and `/health`'s uptime.
4. **NestJS → Cloudflare's restricted rule → the tunnel → Ollama on poseidon.** Drawn only while
   `ask` is active, with the model runtime's state from the lab snapshot.
5. **the lab → the API**, the snapshot's push, with its age.

Hops 4 and 5, and the facts behind 2 and 3, come from `content/lab.ts`, so the panel and `/lab`
can't tell two stories. Until the lab map ships, the panel has hops 1 to 3.

Only the colo's code is shown, not a city: a table of Cloudflare's locations would be data to keep
current for one word of decoration.

## The command

- `xray` turns the layer on with both lines per tag, as today plus the data line.
- `xray path` turns it on with the panel open; `xray` on its own leaves the panel closed, so the
  trace is fetched only when asked for.
- `path` is offered for Tab and stays linkable: the trace is a read, and `writes` stays `none`.

## Accessibility

The data line is part of the tag's link text, so it is read where the tag is. The panel is a
labelled region with an ordered list; it takes no focus when it opens, as the tags don't, and
`Esc` still ends x-ray.

## Tests

- **Frontend:** matching resource entries to routes (`apiUrl` stripped, query dropped, newest
  wins); parsing `Server-Timing`; `parseTrace()` keeps exactly three keys, given a fixture with
  `ip=` and `loc=` in it; the source-scan spec for `data-api`; the hop list with the lab absent
  and present.
- **Backend:** `Timing-Allow-Origin` names only the frontend origin; `Server-Timing` on each
  caching route, hit and miss, and on no other route.
- **E2E:** `?run=xray` shows a data line on the gaming section with the API fixture;
  `?run=xray path` shows hop 1 as not behind Cloudflare and, by a regular expression on the
  panel's text, no IP address anywhere.

## Out of scope

- A waterfall of every request, and any history of past requests: that is `strace`'s job.
- Headers, ever. Theirs carry the admin password and room tokens.
- Sending anything anywhere. *Dropped* turned down field reports because beacons cut against the
  site's no-RUM stance; this reads the visitor's own browser, shows it to them, and keeps nothing.
