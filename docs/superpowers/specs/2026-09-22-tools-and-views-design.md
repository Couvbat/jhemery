# Design spec — views, the prism swing, and the tools page

Status: proposed. Follows [the three.js background spec](2026-07-27-threejs-wireframe-background-design.md)
and features-spec §5.3, which it extends; the terminal side follows features-spec §2 ("the registry
is the API"). Four decisions were taken before this was written and are treated as fixed:
**page-first** (the `/tools` page is the product, terminal commands derive from it),
**`ffmpeg.wasm` is an accepted exception** to the no-new-runtime-deps principle, **realtime rooms
come after the client-side tools**, and **the downloader is admin-gated** — it exists for the
owner, not for visitors.

## Context

The site is one route. Everything the navbar, the terminal's `cd`/`ls`/`pwd`, the command palette
and the background's palette know about is a *section* of that one page, and every one of them
reads `src/content/sections.ts` for the list. That is the shape to preserve: a second page must not
become a second, hand-maintained list of destinations.

The three.js background is a sibling of `<RouterView>` in `App.vue`, so it already survives a
route change — and does nothing to mark it. Three facts about `ThreeBackground.vue` decide how the
transition below is built, more than taste does:

1. **The camera has no orbit and nothing fights it.** `animate()` pins `z` to `cameraBaseZ`, eases
   `x`/`y` toward the pointer, and `lookAt`s a target that lerps between an inspected shape and the
   origin. A swing is one more term added to that, not a rewrite.
2. **The scene is a slab, and a literal orbit puts the camera inside it.** Homes spawn at
   `x ∈ ±width/2`, `y ∈ ±7`, `z ∈ [-10, +2]` — at 16:9 a field of roughly 20 × 14 × 12 units centred
   at z ≈ −4, with the camera at z = 10. Orbit it 90° at radius 10 and the camera sits on the slab's
   edge with shapes beside and behind the near plane.
3. **There is no world reference.** Alpha canvas, no floor, no skybox. A camera yaw is only ever
   visible as *the shapes sweeping across the screen with depth parallax* — and rotating the camera
   and the shapes together is a literal no-op. What the eye reads as "the world turned" is sweep +
   parallax + settle, in agreement with the page moving. The design produces exactly that and does
   not chase a geometrically faithful side view that does not exist.

Two constraints already govern every effect on this site and govern this one: under
`prefers-reduced-motion` the background is never mounted (`App.vue`), and for everyone else it
arrives on `requestIdleCallback`. The transition has to be complete **with no three.js present**.

Hosting sets the ceiling for the later phases: o2switch shared hosting, CloudLinux Passenger
running `dist/main.js`, Apache with `mod_rewrite` and no `mod_proxy`, SSE proven (`/presence`),
WebSockets unproven, and no assumption that `ffmpeg` or `python3` exist on the shell
(`docs/deploy.md`).

## What changes outside the tools themselves

### 1. `views.ts` — a second content list, one level above sections

`src/content/views.ts` defines the top-level destinations the way `sections.ts` defines the
sections:

```ts
export interface ViewMeta {
  id: string            // 'home' | 'tools' | later 'watch' | 'radio'
  path: string          // '/', '/tools'
  label: Localised      // what the navbar and `ls` print
  prompt: string        // the fake shell line above the page heading
  heading: Localised
}
export const views: ViewMeta[]
export const viewIds: string[]
export function findView(name: string): ViewMeta | undefined   // id or localised label, like findSection
export function viewIndex(path: string): number                  // position in the list; views.length for unknown
```

It lives in `src/content` because the same purity rule applies — the résumé plugin never reads it,
but the navbar, the router, the terminal and the swing all do, and the list must not be
reconstructible from anywhere else. The **order of the array is the order of the prism** (§3):
`home → tools → watch → radio`, so the direction of a swing is the sign of the index difference and
Back unwinds what Forward wound.

Sections stay what they are: anchors inside `home`. `activeSection` keeps tracking the home page's
scroll. A new module-level `activeView` ref (in `useViewSwing.ts`, set from the router) says which
view is showing, and `pwd` composes the two:

```
/home/couvbat/projects        on the home page, scrolled to projects
/home/couvbat/tools           on /tools
/home/couvbat/tools/image     with the image tool open
```

### 2. One navigation function, and `cd` learns about paths

Today three surfaces call `scrollToSection(id)` directly — the navbar, the palette, and the
terminal's `navigate`. From `/tools`, that call finds no element and returns `false`. Rather than
teaching all three about routes, one function learns it once:

```ts
goTo(target: string): boolean   // useViewSwing.ts
```

`target` is anything `cd` accepts: `about`, `projets`, `tools`, `/tools`, `~/tools/`, `tools/image`.
The first path segment is resolved as a section (→ scroll if on `home`, else
`router.push({ path: '/', hash })` and scroll once the swing settles), or as a view
(→ `router.push(view.path + rest)`); a view's sub-path is validated against the view's own
registry (for `tools`, the tool ids), so `cd tools/nope` is `No such file or directory` in the
terminal rather than a page that says so. `CommandContext.navigate` widens its contract from
"a section id" to "anything `cd` accepts" and delegates to `goTo`; the shell keeps closing the
overlay on success, which is what makes `cd tools` feel like leaving the room.

`ls` lists `tools/` among the section directories; `ls tools` lists the tools; `cd` and `ping`
complete views and `tools/<id>` alongside sections. `ping tools` works because `ping` already ends
in `navigate`.

### 3. The prism — one clock, three readers

The pages are faces of a prism whose axis runs vertically through the scene's origin, behind the
screen. Navigating turns the prism; the camera turns with it. Three layers read one clock.

**The clock — `useViewSwing()`.** Module-level, in the exact shape of `useSceneControl` ("the
router sets, the components read"):

- `swing: Ref<number>` — **eased** progress 0 → 1 (ease-in-out, `SWING_MS = 650`), driven by
  `requestAnimationFrame`. Eased once here so the DOM and the field never disagree on the curve.
- `swingDirection: Ref<1 | -1>` — from the view order.
- `swinging: Ref<boolean>` — true from the first frame to the last; the stage reads this to become
  a clipped, fixed, perspective box and to go back to normal flow afterwards.
- `installViewSwing(router)` — registers `router.afterEach`, sets `activeView`, and starts a swing
  when the *view* changed (a hash change on the same route — `cd projects` — never swings). It also
  records `window.scrollY` at that instant, because the leaving page must keep showing what the
  visitor was looking at while the window scrolls to the new page's top.
- Under `prefersReducedMotion()` there is no tween: `swing` is 1, `swinging` never becomes true,
  and the `<Transition>` is told `:css="false"`, which in Vue means the swap is instant.

When a swing settles and the route carries a hash, `scrollToSection(hash)` runs then — the
router's own `scrollBehavior` fires while the stage is fixed and the document has no height, so it
clamps to zero and is harmless, but it cannot be relied on for the cross-view `cd projects`.

**The DOM layer.** `App.vue` wraps `<RouterView v-slot="{ Component }">` in a stage. While
`swinging`, the stage is `position: fixed; inset: 0; overflow: hidden` with an inner element
carrying `perspective: 1200px; transform-style: preserve-3d` — two elements because `overflow:
hidden` forces `transform-style: flat` on whatever it is set on. The two pages are the faces:

```css
/* R is half the viewport width, so adjacent faces meet at a right angle */
.view-leave-active { top: var(--leave-scroll); transform: translateZ(-R) rotateY(calc(var(--swing-dir) * -90deg * var(--swing))) translateZ(R) }
.view-enter-active { transform: translateZ(-R) rotateY(calc(var(--swing-dir) *  90deg * (1 - var(--swing)))) translateZ(R) }
```

Both are in the DOM for the whole swing (the default `<Transition>` mode, not `out-in`), both are
`pointer-events: none` and `backface-visibility: hidden`, `will-change: transform` only while the
classes are on, and `--swing` is the composable's ref bound as an inline custom property on the
stage. The fixed chrome — `NavBar`, `TerminalLauncher`, the toasts — is already a *sibling* of
`RouterView`, so it stays put: *you* do not turn, the world does. Nothing inside a view may be
`position: fixed` (a transformed ancestor becomes its containing block); nothing is today, and
this is now a rule.

**The three.js layer.** This is where fact 2 bites, and the fix is small:

- **Rotate the field, not the camera.** The shapes (and the constellation lines) move into a
  `THREE.Group` positioned at the slab's centre `(0, 0, −4)`; homes are sampled around the group's
  origin. Rotating the group by `−yaw` about its own axis is the same image as yawing the camera
  by `+yaw`, and the camera stays where every invariant assumes it is.
- **A modest angle, with a dolly.** `yaw = direction · FIELD_YAW · swing` with `FIELD_YAW ≈ 40°`,
  and the camera pulls back `z: 10 → 10 + DOLLY · sin(π · swing) → 10` with `DOLLY ≈ 6`. The DOM
  does a true 90° because "next face" *means* 90° for a prism; the wireframe cloud only needs to
  agree in **direction and timing** — 90° of a 20-unit-wide slab flies shapes through the lens.
  Nobody measures the angle of a cloud. Both are tunable constants.
- **Re-home during the swing.** At the first frame every shape draws a fresh `home` from the spawn
  distribution, expressed in the frame the bake below will produce; `offset` is adjusted by the
  difference so nothing jumps, and the existing `offset.lerp(target, 0.045)` drifts it there —
  §5.3's own words, *"let go is just a zero target, not a special case"*. No new motion primitive.
- **Bake at `swing === 1`.** `home` and `offset` are rotated by the final group rotation and the
  group's rotation is set back to 0. Visually a no-op; it **restores the invariant** that
  `halfExtents`, the pointer projection and the gravity well all assume — camera on +z, field
  facing it, positions in world axes. Without it every route change would slowly break the well.
- The gravity well is off while `swinging` (its z = 0-plane maths is wrong in a rotated frame for
  650 ms; nobody will miss it) and `lookAt` uses the focused shape's *world* position.

Net effect: shapes sweep sideways with real depth parallax *and* reshuffle, landing in a new
composition, in step with the page swinging in from the same side.

**Palette.** `SECTION_PALETTES` gains a sibling `VIEW_PALETTES` for `tools` (and later `watch`,
`radio`); `currentPalette()` prefers the view's palette when `activeView` is not `home`, then the
section's, then `about`. Completionist still wins over everything. Each route gets a mood, exactly
as each section already does.

**Degradation.**

| Situation | Behaviour |
|---|---|
| Reduced motion | Instant swap. The background is not mounted anyway. |
| Background not loaded yet / WebGL unavailable | DOM swing alone; the composable does not care whether anyone reads `swing`. |
| `cd tools` from the terminal | The overlay closes (`navigate` already does), then the swing runs. |
| Back / forward | Direction from the view order, so the prism unwinds. |
| Hash navigation on the same view | No swing. |
| Unknown route (404) | Treated as the last face; swings like any other. |

**Cost.** Lighthouse audits `/` only and the swing fires on navigation, so its budgets are
untouched; the stage is a static wrapper with no layout of its own, and CLS is re-measured rather
than assumed. The one thing to **measure before trusting**: a full-height home page as a
composited `rotateY` layer on a phone GPU. The stage already clips to the viewport during the
swing, which is the likely mitigation; if it is not enough, the leaving face gets
`contain: paint`.

### 4. `/tools` and the tool registry

`src/tools/registry.ts` is to tools what `commands/index.ts` is to commands:

```ts
export interface ToolMeta {
  id: string                          // URL segment and `cd tools/<id>`
  name: Localised
  description: Localised
  /** For the palette and `ls tools`; nothing else reads them. */
  keywords: string[]
  /** Which tier §5 puts it in. `wasm` tools warn about their download before starting it. */
  tier: 'client' | 'wasm' | 'admin'
  load: () => Promise<Component>      // the panel, one lazy chunk per tool
}
export const tools: ToolMeta[]
export function findTool(id: string): ToolMeta | undefined
```

The registry is not in `src/content` because `load` imports Vue components. Everything else about
it follows the content rules: metas are plain data, both locales are mandatory, ids are unique and
lowercase — `tools-registry.spec.ts` asserts the same invariants `registry.spec.ts` asserts of
commands.

**The route** is `/tools/:tool?` on one `ToolsView`. No tool open: a grid of cards from the
registry, each a bash-window like every other card on the site (`SectionHeader` styling, prompt
`ls ~/tools`). A tool open: its panel above the grid, deep-linkable. Sub-routes inside a view never
swing.

**A panel** is a `.vue` file plus a pure `.ts` next to it holding every computation
(`src/tools/<id>/<id>.ts`), tested in jsdom like a game's state module. Files never leave the
browser in tiers `client` and `wasm`; the page says so once, in the header, rather than per tool.

**The `tools` command** lists the registry with descriptions and `tools <id>` opens one (it is
`navigate(\`tools/${id}\`)`). It is `palette: true`, which is how Ctrl+K finds the page. The
palette also gains one `cd tools` entry per view, ahead of the commands, mirroring its section
entries.

### 5. The tools, in three tiers

**Tier `client` — zero dependencies, ships first.** Each is small enough to be one PR or one
commit, and every one is useful without a backend:

| Tool | What | Notes |
|---|---|---|
| `image` | Convert between PNG / JPEG / WebP, resize, quality slider | `<canvas>` re-encode. Strips EXIF (and GPS) by construction, which is the privacy pitch. The "file converter" the request asked for, in the tier that needs no download. |
| `hash` | SHA-1 / SHA-256 / SHA-512 of text or a dropped file, hex and base64 | `crypto.subtle.digest`. |
| `encode` | Base64 ⇄ text (UTF-8 safe), URL encode/decode, hex | Pure string maths. |
| `json` | Format, minify, validate with the error position | `JSON.parse` + a pointer to the offending offset. |
| `colour` | hex ⇄ rgb ⇄ hsl ⇄ oklch, contrast ratio against the site's palette | The site's own tokens as presets. |
| `time` | Epoch ⇄ ISO ⇄ local, "in 3 days" relative, time-zone table | `Intl.DateTimeFormat`. |
| `password` | Random passwords and diceware passphrases | `crypto.getRandomValues`; passphrases reuse the generated word lists the games already ship. |
| `text` | Word / character / line counts, reading time, case tools | Trivial and used constantly. |

The first slice ships `image`, `hash`, `encode`, `json`; the other four follow one at a time.

**Tier `wasm` — `ffmpeg.wasm`, the accepted exception.** Audio/video conversion (`mp4 → mp3`,
`wav → mp3`, trim, extract audio). One dependency, loaded only when the tool is opened, from a
chunk excluded from the PWA precache exactly as three.js is (`globIgnores` + the runtime
StaleWhileRevalidate rule already covers it). The panel states the download size before fetching
and never starts on its own — a 30 MB core is not something a page pulls on a visitor's behalf.
`SharedArrayBuffer` needs `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers,
which `public/.htaccess` can set for `/tools/*` only; the single-thread core is the fallback where
they cannot be set. Not in the first slice.

*As built (slice 3):* single-thread core, by decision rather than fallback — COOP/COEP applies to
the document, and this is one document, so it would break the SoundCloud embed on the home face.
The core is served from our own `/assets/` so the CSP keeps `'self'`, with `'wasm-unsafe-eval'` as
the one addition; the loader and worker chunks are precache-excluded, the `.wasm` relies on the
immutable `/assets/` header. Inputs are read in place over WORKERFS. Two quirks of the 0.12.10
core shaped the code: its `ffprobe` returns -1 on success, so the JSON is written to a file; and
its `libopus` traps with `memory access out of bounds`, poisoning the instance, so the free audio
preset is Vorbis and any trap restarts the engine.

**Tier `admin` — the downloader.** `yt-dlp` for YouTube / SoundCloud audio, visible only after
the existing `ADMIN_PASSWORD` unlock (the mechanism the guestbook moderation uses). Gating fixes
the legal exposure, not the hosting one, so it is designed as a **job, not a request**:

- `POST /jobs/download { url }` (admin, rate-limited) starts a background process and returns a
  job id; `GET /jobs/:id` polls; `GET /jobs/:id/file` streams the result from `DATA_DIR` and
  deletes it. A request that waits four minutes for a download dies at Passenger's timeout, and
  Cloudflare turns a silent origin into a 524 (`deploy.md`).
- Before any of it: `ssh <o2switch> 'which python3 ffmpeg; python3 --version; ulimit -t'`. If both
  binaries exist, the job runs on the box; if either is missing, the same job API fronts a runner
  on a machine the owner controls, and the backend only relays. Either way the frontend is
  identical, which is why the API is designed first and the runner second.
- Off by default (`DOWNLOADER_ENABLED=false`), `configured: false` when off, like `ask` and
  `guestbook`.

*As built (slice 5):* the shell check (deploy.md) said the box can run it, so the runner is on
the box and the relay was never built. `POST /jobs` is admin-only like every other job route, so
the frontend's unlock — `sudo -i`, kept in `sessionStorage` for the tab — is checked against
`GET /jobs` rather than against the guestbook. What yt-dlp is handed is an allowlist of URL
shapes, one video or one track, because a set or a profile is the request burst that got the
host's IP blocked during the check. Bounds: one running, three pending, ten minutes, 200 MB,
files deleted once fetched or after 30 minutes, the job directory emptied on boot.

### 6. Watchparty and radio — after the client-side tools

Both are the same feature with a different player. A **room** is a short code; the host controls
playback; guests receive state. Given SSE is proven on this host and WebSockets are not:

- `POST /rooms` creates one (returns code + host token); `GET /rooms/:code/events` is the SSE
  stream of `{ videoId, position, playing, at }` states plus a member count (an integer, no ids —
  the `/presence` privacy rule); `POST /rooms/:code/state` with the host token changes it. Guests
  correct drift by comparing `position + (now − at)` with their player and seeking when more than
  two seconds out.
- **Watch** embeds the YouTube IFrame API (a script tag, not a package). **Radio** is the same room
  with a queue and the SoundCloud iframe (`MusicSection` already avoids the SoundCloud widget
  script and its DataDome payload; the queue advances on the host's timer instead of the widget's
  `FINISH` event). Rooms live in memory with a TTL and die with the process — acceptable for a
  toy that a Passenger restart resets.
- Behind `ROOMS_ENABLED`, off by default. These are the `watch` and `radio` views, the third and
  fourth faces of the prism.

*As built (slice 4):* no IFrame API script after all. Both embeds answer the `postMessage`
protocol their official scripts wrap — verified before building: YouTube reports `onReady`,
`infoDelivery` (`currentTime`, `playerState`) and obeys `playVideo`/`seekTo`; the SoundCloud
widget reports `ready`, `playProgress`, `seek`, `finish` and obeys `play`/`seekTo`. Driving them
directly keeps every third-party script off this origin, as `MusicSection` already chose, and the
CSP grows by one `frame-src` (`www.youtube-nocookie.com`) and nothing in `script-src`. The queue
therefore advances on the widget's `finish` event, not a timer. State is one shape for both kinds
(`media`, `position`, `playing`, `at`, plus a `queue`), media is allowlisted server-side per kind,
and a room is a code, a state and a head count — no member list.

### 7. Everything a new route touches

Found and small, listed so the checklist does not have to be rediscovered: a router entry
(`/tools/:tool?`, lazy); `public/sitemap.xml` (hand-maintained; add `/tools`); `public/llms.txt`
(one line); `.htaccess` already forwards any path — no change; the service worker's
`navigateFallback` is correct for a page — no change; the README's "The page" table and a `Tools`
section; `features-spec.md` gets a short §11 pointing here.

## Rejected

- **A literal camera orbit to a side view** — fact 2: the camera ends up inside the field.
- **A roll about the view axis** — reads as a dial being turned, not a room being crossed.
- **Scroll-driven transition** — there is no scroll between routes.
- **`mode="out-in"` with a fade** — a fade says "loading"; the swing says "next room". The fade is
  what reduced-motion visitors get, deliberately, as the honest static equivalent.
- **A `tools` section on the home page** — the home page is a portfolio; a converter between the
  music player and the Steam card would make both worse. And it would give the prism nothing to
  turn to.
- **Rotating the camera *and* fixing it with a floor grid** — a grid would give the yaw a
  reference, and would also be a permanent new element on every page for a 650 ms effect.
- **Socket.IO / WebSockets for rooms** — unproven on Passenger behind Apache without
  `mod_proxy`, while SSE + POST is already in production for `/presence`.

## Testing

- `views.spec.ts` (content): `findView` resolves ids and both labels; order is the prism order;
  `viewIndex` returns `views.length` for unknown paths. The purity spec covers the module for free.
- `useViewSwing.spec.ts`: direction from the index difference, no swing on a hash-only change,
  reduced motion snaps to 1 without ever setting `swinging`, the tween reaches exactly 1 and
  settles (fake `requestAnimationFrame`).
- `tools-registry.spec.ts`: unique lowercase ids, both locales, `findTool`.
- One pure spec per tool next to the game specs.
- `navigate` command tests: `cd tools`, `cd tools/image`, `cd tools/nope`, `pwd` on a view,
  `ls tools`; `completion.spec.ts` gains `cd to` → `cd tools `.
- Playwright `views.spec.ts` — only what jsdom cannot see: `/tools` renders and survives a hard
  reload (the SPA fallback), the navbar link swings there and the stage's swinging class appears
  and clears, `reducedMotion: 'reduce'` never sets it, and the sitemap lists every view path.
- Manual, both locales: the swing in both directions at 16:9 and on a phone; `cd projects` from
  `/tools` lands on projects; Back from `/tools` unwinds.

## Out of scope

Light theme and a blog stay out (features-spec §10). No tool stores anything server-side; the
downloader keeps a file only until it is fetched once. No accounts for rooms — a code is the whole
identity. No per-tool analytics beyond the pageview Umami already counts on `pushState`.
