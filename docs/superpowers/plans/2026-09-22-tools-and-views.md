# Plan — views, the prism swing, and the tools page

**Status: complete.** Slice 1 in PR #78, slice 2 in #80, slice 3 in #81, slice 4 in #82, slice 5 in
#83. Two departures from the text below: the ffmpeg core turned out to be 32 MB, not 30, and the
single-thread core was kept on purpose — COOP/COEP would break the SoundCloud embed — so no headers
were added for `/tools/*`.

Implements [the design spec](../specs/2026-09-22-tools-and-views-design.md). One branch per slice,
each a PR into `dev`; the order is chosen so every slice leaves the site whole.

## Slice 1 — `feat/tools-and-views`

The page, the prism, and four client-side tools. Nothing here needs the backend.

1. `src/content/views.ts` + spec. `pwd` composition, `findView`, `viewIndex`.
2. `src/composables/useViewSwing.ts` + spec: `activeView`, `swing`, `swingDirection`, `swinging`,
   `installViewSwing(router)`, `goTo(target)`.
3. `App.vue`: the stage around `<RouterView>`, `installViewSwing(useRouter())`, the CSS for the
   faces in `assets/main.css` (next to the CRT rules, under the same reduced-motion guard).
4. `ThreeBackground.vue`: shapes into a `THREE.Group` at the slab centre; `VIEW_PALETTES`;
   per-frame yaw + dolly from `swing`; re-home at swing start; bake at settle; well off while
   swinging; world-space `lookAt`.
5. `src/tools/registry.ts` + spec; `ToolsView.vue` at `/tools/:tool?`; panels for `image`, `hash`,
   `encode`, `json`, each with a pure `.ts` and a spec.
6. Terminal: `navigate` → `goTo`; `cd`/`ping` accept views and `tools/<id>`; `ls` lists `tools/`,
   `ls tools` lists tools; `pwd` composes; `tools` command (`palette: true`).
7. `NavBar` (`./tools` link on desktop and in the burger, active state by `activeView`),
   `CommandPalette` (view entries, `goTo` for sections).
8. `sitemap.xml`, `llms.txt`, README ("The page" row, navigation table, `Tools` section),
   `features-spec.md` §11, `roadmap.md` §F.
9. Playwright `e2e/views.spec.ts`; extend `static-assets.spec.ts` to assert every view path is in
   the sitemap.

Verification: `npm run type-check`, `npm run lint`, `npm test`, `npm run test:e2e` from
`frontend/`; then the swing by hand in the preview at desktop and phone widths, both directions,
with reduced motion on and off.

## Slice 2 — `feat/tools-client-vol2`

`colour`, `time`, `password`, `text`. Pure additions to the registry.

## Slice 3 — `feat/tools-ffmpeg`

`ffmpeg.wasm` behind an explicit "download 30 MB" step; `globIgnores` entry; COOP/COEP headers in
`.htaccess` for `/tools/*` if the single-thread core turns out too slow.

## Slice 4 — `feat/rooms`

Backend `rooms` module (SSE + POST, in-memory, TTL, `ROOMS_ENABLED`), `watch` and `radio` views,
the third and fourth faces.

## Slice 5 — `feat/downloader`

Only after `ssh <o2switch> 'which python3 ffmpeg'`. Backend `jobs` module, admin-gated, background
process or relay, `DOWNLOADER_ENABLED`.
