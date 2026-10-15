# Design spec — the lab map, a live diagram of the homelab

Status: proposed, not built. The first of six specs from the 15 October 2026 brainstorm
([roadmap §K](../../roadmap.md#k-the-lab-october-2026-brainstorm)), and the foundation of three
of them: it introduces the `lab` backend module and the snapshot that
[the lab shell](2026-10-15-lab-shell-design.md), [ask my lab](2026-10-15-ask-my-lab-design.md)
and [x-ray's data layer](2026-10-15-xray-data-layer-design.md) all read. Build it first.

## Context

Goal: draw the homelab behind the site as a live map at `/lab`, coloured by a snapshot the lab
pushes to the API, so a visitor sees which machines and services run the site and its model.

The site already admits the lab exists, in pieces: `hardware nas` lists the machines' specs,
`ask` says its model lives "in a flat, not a datacentre", and `systemctl status` shows the API's
own units. None of it shows how the pieces connect, or whether any of them is up right now. The
audience this batch was chosen for is peers and the self-hosting crowd, so the map is the hero
piece: readable in a glance, with depth behind every node.

Two rules decide the design, and everything below follows from them:

- **Push, never pull.** No visitor request ever reaches the home network. The API never calls
  into the lab on anyone's behalf; the lab sends a snapshot on its own schedule, and a visitor
  reads the copy the API holds. It is `/health`'s rule ("read only what the service already
  holds") applied to a whole network.
- **The map works with the lab off.** The topology is content, built into the page; the
  snapshot only colours it. With the feed unconfigured, the API down or the lab asleep, the map
  is still a correct diagram, saying plainly that its live data is off or how old it is
  (principle 3).

## What the map may show

The map publishes facts about a private network, so what it may say is written down once, here,
and enforced twice: by the lab when it builds the snapshot, and by the API, which refuses anything
outside the schema (see "Validation").

| Shown | Never shown |
|---|---|
| Machine names, already public in `content/hardware.ts` | IP addresses, of any version |
| Product names and roles: Cloudflare Tunnel, Nginx Proxy Manager, Tailscale, Uptime Kuma, Glances, n8n, Umami, Ollama, Odysseus | Internal hostnames, URLs and ports |
| Health words: up, down, degraded, stale | Software versions: a public "Nginx Proxy Manager 2.x.y" is a CVE lookup |
| Coarse metrics: CPU and memory in percent, temperatures, load, pool health and fill, GPU use and VRAM | Admin panel addresses, container ids, serial numbers, MAC addresses, paths, user names |
| A service's status, latency and 30-day daily uptime | Anything on the Tailscale side beyond the fact that it exists |
| The names of the models loaded and installed | The model host's public hostname, which `.env.example` keeps out of the repo on purpose |

## Topology is content — `content/lab.ts`

The diagram is the single source of truth for what the lab *is*; the snapshot only says how it
*is doing*. It lives in `src/content/` like everything else a visitor reads, so it is pure data,
imports only its siblings, and `purity.spec.ts` covers it.

```ts
export interface LabNode {
  /** Lower-case: `poseidon`, `npm`. The key the snapshot uses, and `LAB_NODES` lists. */
  id: string
  kind: 'visitor' | 'edge' | 'host' | 'machine' | 'service' | 'private'
  name: string
  role: Localised
  /** Product names, as facts: `['Docker', 'Ollama']`. */
  stack: string[]
  /** Why it is there, for the node's detail. */
  why?: Localised
  /** A `why` topic (`content/decisions.ts`), linked as `?run=why <id>`. */
  decision?: string
  /** The `content/hardware.ts` machine it is, for its specs. */
  machine?: string
  /** The machine a service runs on: draws it inside that machine's card. */
  on?: string
  /** The tier it is drawn in, left to right along the request path. */
  tier: number
}

export interface LabLink {
  from: string
  to: string
  kind: 'public' | 'tunnel' | 'restricted' | 'private' | 'push'
  label?: Localised
}

export const labNodes: LabNode[] = [ /* … */ ]
export const labLinks: LabLink[] = [ /* … */ ]
```

The nodes, from what the owner has said so far. Which machine runs each service is for the owner
to fill in before building:

| Tier | Nodes | Links |
|---|---|---|
| 0 | visitor | to cloudflare, public |
| 1 | cloudflare (edge, DNS, proxy, the IP rule in front of the model) | to o2switch-site and o2switch-api, public; to tunnel, tunnel |
| 2 | o2switch-site (Apache, the built SPA), o2switch-api (Passenger, NestJS), tunnel (cloudflared on TrueNAS) | o2switch-api to cloudflare, restricted ("only the API and home may reach the model"); tunnel to npm |
| 3 | npm (Nginx Proxy Manager), tailscale (private) | npm to the services; tailscale to the machines, private ("admin only, not reachable from here") |
| 4 | optimus, poseidon (machines), with their services inside: umami, kuma, glances, n8n, dashy, gnome, missigno, ollama, odysseus, lab-agent | lab-agent to o2switch-api, push ("the snapshot") |

So the model's path reads, left to right: the API, Cloudflare's restricted rule, the tunnel,
Nginx Proxy Manager, Ollama on poseidon. That is the route `ask` takes today, drawn.

**Azazel is retired**, so it is not on the map. `content/hardware.ts` still lists it as a NAS;
marking it retired there is a separate content change, and the map doesn't wait on it.

### Which services are on it

The owner's rule: **every service that isn't critical is on the map.** A service is critical
when its job is holding personal data or secrets (a database, file storage, a password vault),
when it is an admin console, or when it is reachable only over Tailscale. A critical service is
neither a node in `content/lab.ts` nor an id in `LAB_NODES`, so even a Kuma monitor that
watches it has nowhere to land: the lab agent sends only the monitors it is told to map.

| On the map | Off the map, as critical |
|---|---|
| Umami, Uptime Kuma, Glances, n8n, Dashy, Gnome (the Discord app), missigno, Ollama, Odysseus, and the lab agent itself | MongoDB, the TrueNAS and Nginx Proxy Manager admin interfaces, anything behind Tailscale |
| Cloudflare Tunnel and Nginx Proxy Manager, as the path rather than as consoles | Nextcloud and its MCP server: public at their own address, but holding personal files, so off in this draft; the owner can move them |

A service added to the lab later goes on the map by adding a node and an id, so the default
for anything new is the owner's choice, made once, in content.

A content spec holds the data together: ids are unique and lower-case, every link's ends exist,
every `machine` names a `hardware.ts` machine, every `on` names a machine node, every `decision`
is a `decisions.ts` id, and every tier is contiguous from 0.

## Backend — `backend/src/lab/`

`lab.module.ts`, `lab.controller.ts`, `lab.service.ts`, `lab.dto.ts` (the snapshot's schema),
`lab.types.ts`, with their specs, registered in `app.module.ts` and in `HealthController`'s list.

### Configuration — off by default

`LAB_ENABLED=false`, `LAB_INGEST_TOKEN=` (at least 32 characters; shorter counts as unset) and
`LAB_NODES=` (comma-separated ids the API will store). Off by default for the same reason `ask`
is: it publishes facts about a private network, and that is the owner's decision to make, not an
install's default. `.env.example` documents all three, with the "why" in the house style.

### `POST /lab/snapshot` — the lab's push

- **Who:** `Authorization: Bearer <token>` against `LAB_INGEST_TOKEN`, compared with
  `sameSecret()` from `common/admin.guard.ts`. Missing, short or wrong is a bare 403. Unset
  token means locked, never open — the same rule as `ADMIN_PASSWORD`.
- **What:** a route-level `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, so
  an unknown property is a 400 that names it. The global pipe strips unknown fields silently;
  here silence would hide an agent that has started sending something it shouldn't.
- **How often:** `@RateLimit({ limit: 6, windowMs: 60_000 })`. The lab pushes once a minute.
- **Unknown ids** (not in `LAB_NODES`) are dropped before anything is stored, and named in the
  answer: `200 { accepted: 7, dropped: ['poseidonn'] }`. A typo shows up in the agent's log
  instead of as a node that never lights.
- **Defence in depth**, for `deploy.md` rather than code: a Cloudflare WAF rule that admits
  `POST /lab/snapshot` only from the home network. The token is the control; the rule means a
  leaked token is not enough on its own.

### The snapshot

```ts
interface LabSnapshot {
  /** When the agent took it, by its clock. More than 10 minutes from the API's is a 400. */
  takenAt: string
  machines: MachineSample[]   // at most 8
  services: ServiceSample[]   // at most 32
  models?: ModelSample
  tunnel?: { healthy: boolean; connections: number }
}

interface MachineSample {
  id: string
  up: boolean
  uptimeSeconds?: number
  cpu?: number                // percent, 0–100
  memory?: number             // percent, 0–100
  load?: number               // one-minute load average
  tempC?: { cpu?: number; gpu?: number }
  pools?: { name: string; health: 'ONLINE' | 'DEGRADED' | 'FAULTED' | 'OFFLINE' | 'UNAVAIL'; used: number }[]  // used is 0–1, at most 8
  gpu?: { util: number; vramUsedMb: number; vramTotalMb: number; powerW?: number }
  containers?: number         // a running count, never names
}

interface ServiceSample {
  id: string
  status: 'up' | 'down' | 'maintenance'
  latencyMs?: number
}

interface ModelSample {
  runtime: 'up' | 'down'
  resident: { name: string; vramMb: number }[]   // `ollama ps`
  installed: { name: string; sizeGb: number }[]  // `ollama list`, at most 20
}
```

### Validation

The DTO mirrors the interfaces with `class-validator`, nested, with every number bounded and every
array capped. On top of shape:

- ids match `^[a-z0-9-]{1,32}$`; pool and model names `^[A-Za-z0-9._:/-]{1,64}$`;
- no string anywhere may look like an address: a dotted quad, an IPv6 group with `::`, a
  `host:port` pair, a `://`, or a name ending in `.lan`, `.local`, `.home.arpa` or `.ts.net`.
  Model names such as `gemma4:e4b` must still pass, so the port rule is a hostname followed by
  `:` and digits only, not any colon.

A spec feeds the validator a list of near misses (an IP in a pool name, `npm.lan:81` as a model
name, a sixth decimal place of nonsense) and holds each to a 400.

### State and history

- The latest snapshot is kept in memory and written to `DATA_DIR/lab.json` (write then rename,
  as `stats` does), so a deploy, which restarts the process, doesn't blank the map.
- Each accepted snapshot also counts towards a **daily rollup** per node: `{ day, up, total }`
  by UTC day, thirty days kept. A day with no snapshot at all is `null`, "no data", and is drawn
  grey, never red: the API cannot tell a sleeping lab from a broken push, and the bars must not
  claim an outage it didn't see.
- A snapshot is **stale** five minutes after it arrived: five missed pushes.

### `GET /lab` — what visitors read

```
{ configured: false }
{ configured: true, receivedAt, ageMs, stale, snapshot: LabSnapshot | null,
  history: Record<id, (number | null)[]> }   // 30 fractions up, oldest first
```

Never calls the lab. `@RateLimit({ limit: 60, windowMs: 60_000 })`, and
`Cache-Control: public, max-age=15`.

### Health

`LabService.health()`: `inactive` with `unconfigured` until enabled with a token; `cacheAge` is
the time since the last snapshot; `detail: { nodes }`. `systemctl status lab` then works with no
frontend change beyond a row in `systemctl.ts`'s `UNITS`.

## The lab's side — `lab-agent/`

A small agent in the repo, run as one container on a NAS, collects the snapshot and pushes it.
It replaces a hand-built automation workflow: the owner runs n8n but has no workflow in it, and
a workflow would keep the allowlist in a place no test reaches. In the repo, the agent is
reviewed, tested in CI, and kept in step with the API's schema. n8n stays on the map as a
service; the API doesn't care who pushes, so a workflow could replace the agent later.

### What it is

- A top-level `lab-agent/` folder of plain ES modules for Node 22, with **no dependencies and no
  `package.json`**: built-in `fetch`, `AbortSignal.timeout` and `node:test` are enough. So it is
  not a third npm project, there is nothing to install, and Dependabot has nothing to watch.
- `snapshot.mjs`, pure: turns the sources' raw answers into the snapshot, copying allowlisted
  fields only, by name, and checking its own output against the API's address rules before
  anything is sent (the same rules, so a leak is stopped on the lab's side too).
- `sources.mjs`: one fetcher per source, each with a 5 s timeout. A source that fails or isn't
  configured leaves its part out; a machine whose Glances doesn't answer is `up: false`.
- `agent.mjs`: the loop. Every `LAB_INTERVAL_S` (60 by default) it fetches every source in
  parallel, builds the snapshot and `POST`s it with the bearer token. One log line per push:
  `pushed: 7 accepted, 0 dropped`, or the API's 400 with the property it named. A failed push
  waits for the next tick; it never retries in a burst.
- `Dockerfile` (the official `node:22-alpine`, a non-root user, no port exposed: the agent only
  makes outbound requests) and `compose.example.yaml` for a TrueNAS custom app.

### Its sources

- **Glances'** REST API on each machine: quicklook, sensors, uptime, load. The path carries the
  API's version (`/api/4/` on Glances 4, `/api/3/` before), so the fetcher reads the version once
  and uses it.
- **TrueNAS**, for pool health and fill, through whichever API the installed release offers (the
  REST `pool` endpoint is deprecated in recent releases in favour of the JSON-RPC one); Glances'
  file-system plugin gives fill alone when neither is configured.
- **Uptime Kuma's** `/metrics` (Prometheus text, behind an API key): `monitor_status` and
  `monitor_response_time` per monitor, parsed by a small pure function.
- **Ollama's** `/api/ps` and `/api/tags`.
- **cloudflared's** metrics endpoint, for the tunnel's readiness.

### Configuration, on the NAS only

Environment variables in the custom app, never in the repo, since they hold the lab's internal
addresses:

- `LAB_API_URL`, `LAB_INGEST_TOKEN`, `LAB_INTERVAL_S`;
- `LAB_GLANCES` as `id=url` pairs (`poseidon=…,optimus=…`), `LAB_TRUENAS` and its keys the same
  way, `LAB_KUMA_URL` and `LAB_KUMA_KEY`, `LAB_OLLAMA_URL`, `LAB_CLOUDFLARED_URL`;
- `LAB_KUMA_MONITORS`, mapping Kuma's monitor names to node ids (`Umami=umami,…`). A monitor not
  in the map is never sent, which is how a critical service watched by Kuma stays off the feed.

### Running it

The simplest deployment needs no registry: the official image with the folder mounted from a
dataset (`command: node /app/agent.mjs`), updated by pulling the repo on the NAS.
`compose.example.yaml` shows that. Publishing an image to GHCR from CI is possible later and
isn't needed for a single host.

### Kept in step with the API

- The agent's tests run with `node --test lab-agent/` as one more step in the backend's PR check,
  so no new required check is needed (and no `paths:` filter, per CLAUDE.md).
- `lab-agent/fixtures/` holds a raw answer from each source and the snapshot they should make.
  A backend spec validates that expected snapshot against the DTO, so a change of schema on either
  side fails CI before it can fail a push.

## Frontend

### The route

- `/lab` → `views/LabView.vue`, lazy, in `router/index.ts`. Outside the prism, like `/now` and
  `/privacy`, so `content/views.ts` doesn't change and the navbar stays at its width.
- An entry in `content/pages.ts` with a title and description in both locales. The pages plugin
  then writes its head copies, `.htaccess` already serves them, and `discovery.spec.ts` will ask
  for the route in `sitemap.xml` and `llms.txt`.
- `llms.template.md` gains a `{{lab}}` list, one line per node (`name — role`), rendered from
  `labNodes` by `vite-plugins/discovery.ts`. That is what lets `ask` answer "what runs this
  site" from its corpus ([ask my lab](2026-10-15-ask-my-lab-design.md)).
- The search index gets one entry for the page.
- `SiteFooter.vue` links `/lab` beside `/now`. `hardware nas` ends with a muted `live: /lab`;
  `hardware` is one of the curl pages, so its snapshots are rewritten with the `-u` run CLAUDE.md
  gives.

### Layout: HTML cards, SVG wires

- Every node is a real element: a list item in one ordered list per tier, laid out as a CSS grid. So a
  node is focusable, read by a screen reader in request-path order, tagged by x-ray, and
  coloured by tokens like everything else.
- The wires are one `aria-hidden` SVG behind the grid, recomputed from the cards' rectangles by a
  `ResizeObserver`. The SVG is decoration; the list is the content. Each card's text names what
  it reaches ("reaches Nginx Proxy Manager, through the tunnel"), so nothing is said by a line
  alone.
- Below `md` the grid is one column and the wires run vertically between cards: the same DOM,
  the same order.
- No graph library, no force layout (principle 5): the tiers are fixed by content, and a
  hand-placed diagram reads better than a simulated one at fifteen nodes.

### A card

- Name, role, and a status word beside its dot — *up*, *down*, *degraded*, *stale*, *no data* —
  never colour alone.
- One or two live figures: CPU and temperature for a machine, latency for a service.
- A disclosure for the depth: stack, why, a `?run=why <id>` link where there is a decision, and
  for services the 30-day bar (one cell per day, a `title` per cell, and a visually hidden
  summary such as "30-day uptime 99.2 %").
- The two machine cards are larger and hold their services: CPU, memory, temperatures, each
  pool's health word and a fill bar, poseidon's GPU (use, VRAM), uptime, and a running
  container count. One line of specs from `hardware.ts`.
- A strip above the map says what the colours are worth: *live · snapshot 42 s old*, *last seen
  3 h ago — the lab may be asleep*, *live data is off here* (unconfigured), or *the API can't
  be reached*.

### Data and motion

- `api.lab()` in `lib/api.ts`. The view polls it every 30 s while the page is visible and stops
  when it isn't or when the visitor leaves; polls are `background: true`, so `strace` leaves them
  out, as it does the guestbook ticker's. The API stays out of the PWA's runtime caching: a
  stale "up" is worse than an honest "unavailable".
- A pure `lib/lab.ts` turns `(node, snapshot, ageMs)` into a state and formatted figures, in both
  locales. The page, the `lab` command and the lab shell all format through it, so they can't
  disagree about poseidon's uptime.
- Motion: at *full*, a small packet travels the public wires; at *calm*, the wires are still; at
  *paused*, nothing moves. CSS animation, so a hidden tab costs nothing.
- Colours are tokens only; a status maps to the existing semantic tokens, never Tailwind's
  palette, so both light schemes stay legible and `themes.spec.ts` is untouched.
- The view's words are `Localised`, in a labels table beside it, not in `i18n/messages.ts`: the
  home page's byte budget is nearly spent (the lesson recorded under §J's "After review"). The
  home page gains a footer link and a router entry, nothing else.

### The `lab` command

Visible, `group: 'live'`, `writes: 'none'`, `linkable: true`, `palette: true`. It prints a
compact table (node, status, one figure), the snapshot's age, and `map: /lab`. `lab --json`
prints the snapshot for a pipe (`lab --json | jq .machines`), as `projects --json` does, with
OPTIONS text in its `manual`. Unconfigured or unreachable, it says so in one line and points at
`hardware nas`. It is a tap-shell button for free. It stays off the curl pages, which are
snapshots served all year.

## Tests

- **Backend (jest):** the DTO accepts a full fixture and refuses each near miss above; the token
  check (missing, short, wrong, unset → 403); unknown ids dropped and named; `takenAt` skew; the
  rollup across a UTC midnight, with a `null` day; `stale` at five minutes; the persistence round
  trip in a temp `DATA_DIR`; `GET /lab` unconfigured; `health()`.
- **Frontend (vitest):** the content spec above; `lib/lab.ts` states and formatting in both
  locales; the `lab` command against configured, unconfigured, stale and unreachable stubs;
  `registry.spec.ts`'s classification gains `lab` as `none`.
- **E2E (Playwright):** only what jsdom can't reach. `/lab` renders the full static map with the
  API unreachable; with a fixture snapshot, poseidon reads *up*; at 375 px the tiers are one
  column.
- **Agent (`node:test`):** `snapshot.mjs` against every fixture, including a Glances answer
  that carries an address and a Kuma monitor not in the map, neither of which may reach the
  output; the Prometheus parser; a source that times out leaves only its own part out.
- **Docs:** README (the route, the command, `GET /lab` and `POST /lab/snapshot` in the API
  table), `features-spec.md` §8, `.env.example`, and `deploy.md` (running the agent and the WAF rule).

## Out of scope

- Any request from the API into the lab, for any reason.
- Controls. Nothing on the page acts on the lab, ever.
- Alerts and notifications: Uptime Kuma already does that, to the owner.
- Charts beyond the 30-day bars, and logs of any kind.
- Server-sent events for the map: a 30 s poll of a 60 s snapshot is already finer than the data.
- The Tailscale side, beyond one dashed node.
