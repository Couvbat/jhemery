<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import map from 'virtual:xray-map'
import { useLocale } from '@/i18n'
import { useBoot } from '@/composables/useBoot'
import { useMatrix } from '@/composables/useMatrix'
import { paletteOpen } from '@/composables/usePalette'
import { useGuestbookTicker } from '@/composables/useGuestbookTicker'
import { useSceneControl } from '@/composables/useSceneControl'
import { terminalOpen, touchViewport } from '@/composables/useTerminalShell'
import { useViewSwing } from '@/composables/useViewSwing'
import { usePresence } from '@/composables/usePresence'
import { setXray, setXrayPath, useXray } from '@/composables/useXray'
import { api, apiUrl, fetchSite, type HealthReport, type LabReport } from '@/lib/api'
import { sourceUrl } from '@/lib/source'
import { dataLine, newestByRoute, newestOf, STREAM_ROUTE, type TimingEntry } from '@/lib/xray-data'
import { parseTrace, pathHops, type Trace } from '@/lib/xray-path'
import { listeningTo } from './music-react'
import { newestSignatures } from './signatures'
import { currentMusic } from '@/lib/music-signal'
import {
  baseName,
  CANVAS_FILE,
  collectTargets,
  groupTargets,
  placeTags,
  tagParts,
  tagText,
  type Rect,
  type TagPart,
} from '@/lib/xray'

/**
 * X-ray mode (roadmap §I): every component on screen outlined, and one tag per file
 * naming it and the files its words come from, each a link to that file at the build's
 * commit. Mounted by `App.vue` while `xray` is on, so this chunk and the words map in it
 * (`virtual:xray-map`) are fetched only then.
 *
 * Fixed chrome, so it lives beside `RouterView` (features-spec §11), measured rather than
 * attached: the boxes and tags are drawn over the page from each element's rect, and
 * nothing is added inside a component, where it would shift its layout or meet its own
 * pseudo-elements. It measures again when the page scrolls, resizes or changes, at most
 * once a frame, and not at all while something is over the page: the terminal or the
 * palette (each a dialog), the matrix rain or the boot replay (each covering the screen
 * and ended by any key), or the page mid-swing.
 *
 * **Keyboard.** The tags are ordinary links in a `<nav>`, and come after the page in the
 * DOM, so the page's own tab order is untouched and Tab reaches them last. Nothing is
 * focused when x-ray turns on and nothing traps focus; turning on is said once in a live
 * region of the layer's own instead. A focused tag stays where it was when its component
 * scrolls away, until focus leaves it. Esc or the *exit* button turn it off, and focus
 * that was on a tag goes back to where it came from.
 */

const { t, m, locale } = useLocale()
const { swinging } = useViewSwing()
const { matrixActive } = useMatrix()
const { bootPlaying } = useBoot()
const { shapeCount, visitorShapes, musicOn } = useSceneControl()
// The field's third pool, the guestbook's newest entries, counted the way the field picks them.
const { entries: guestbookEntries } = useGuestbookTicker()
const signatureShapes = computed(() => newestSignatures(guestbookEntries.value).length)
const fieldShapes = computed(() => shapeCount.value + visitorShapes.value + signatureShapes.value)

interface ShownTag {
  key: string
  parts: TagPart[]
  count: number
  /** The canvas's shape count; nothing for any other tag. */
  extra: string
  /** One line per API route the component names: where its live data came from. */
  data: string[]
  x: number
  y: number
  w: number
  h: number
}

const layerEl = ref<HTMLElement | null>(null)
const chipEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const probeEl = ref<HTMLElement | null>(null)
const probeTextEl = ref<HTMLElement | null>(null)
const boxes = shallowRef<Rect[]>([])
const tags = shallowRef<ShownTag[]>([])
const files = ref(0)

// The rain and the boot sequence (a first visit's as well as a `reboot`) end on any key and
// claim none, and their listeners may come after this layer's: under them, an Esc is theirs alone.
const hidden = computed(
  () => terminalOpen.value || paletteOpen.value || swinging.value || matrixActive.value || bootPlaying.value,
)

const status = computed(() =>
  files.value === 1 ? t(m.xray.statusOne) : t(m.xray.status).replace('{n}', String(files.value)),
)

function extraFor(names: string[]): string {
  if (!names.includes(CANVAS_FILE)) return ''
  // And what the field is following, when music is playing and it is listening.
  const listening = musicOn.value ? listeningTo(currentMusic(), locale.value) : ''
  return ` · ${t(m.xray.shapes).replace('{n}', String(fieldShapes.value))}${listening ? ` · ${listening}` : ''}`
}

/**
 * A tag's size, from a probe drawn with the tags' own classes: monospaced, so a tag is
 * its text's length in `ch` plus its padding and border. Read on every pass, since the
 * web font can land after the first.
 */
const PROBE = '0'.repeat(20)
let metrics = { ch: 6, chrome: 14, height: 18, line: 16 }

function measureProbe() {
  const outer = probeEl.value?.getBoundingClientRect()
  const inner = probeTextEl.value?.getBoundingClientRect()
  if (!outer || !inner || !inner.width) return
  metrics = { ch: inner.width / PROBE.length, chrome: outer.width - inner.width, height: outer.height, line: inner.height }
}

/**
 * The newest request per API route, from what the browser has already recorded (Resource
 * Timing), so `request()` keeps its fast path: the page's requests happened before x-ray
 * turned on, and an observer in `request()` could not have helped. Started `buffered`, so
 * the entries from before the layer mounted come in first.
 */
const timings = shallowRef<Map<string, TimingEntry>>(new Map())
let timingObserver: PerformanceObserver | undefined

function takeTimings(entries: readonly TimingEntry[]) {
  const next = new Map(timings.value)
  for (const [route, entry] of newestByRoute(entries, apiUrl)) {
    const seen = next.get(route)
    if (!seen || entry.startTime >= seen.startTime) next.set(route, entry)
  }
  timings.value = next
}

const { streaming } = usePresence()

function dataLines(apis: string[]): string[] {
  return apis.map((route) =>
    dataLine(route, timings.value.get(route), locale.value, route === STREAM_ROUTE ? (streaming.value ? 'open' : 'closed') : undefined),
  )
}

/**
 * The tag holding focus, when its component is no longer on screen: Space, End and
 * PageDown all scroll the page from a focused link. It stays where it was until focus
 * leaves it, since dropping it would take the focused link out of the page and focus
 * with it, to `<body>`.
 */
function strandedTag(layer: HTMLElement, keys: string[]): ShownTag | undefined {
  const active = document.activeElement
  if (!active || !layer.contains(active)) return undefined
  const key = active.closest<HTMLElement>('[data-xray-tag]')?.dataset.xrayTag
  return key && !keys.includes(key) ? tags.value.find((tag) => tag.key === key) : undefined
}

function measure() {
  const layer = layerEl.value
  if (!layer || hidden.value) return
  measureProbe()
  // The client box, not `innerWidth`: a tag clamped to the edge would sit under the scrollbar.
  const viewport = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
  const grouped = groupTargets(collectTargets(document, viewport, layer))
  const sized = grouped.tags.map((tag) => {
    const parts = tagParts(tag.files, map)
    const extra = extraFor(tag.files)
    const data = dataLines(tag.apis)
    const chars = Math.max(tagText(parts, `${tag.count > 1 ? ` ×${tag.count}` : ''}${extra}`).length, ...data.map((d) => d.length))
    const size = { w: Math.ceil(chars * metrics.ch + metrics.chrome), h: metrics.height + data.length * metrics.line }
    return { tag, parts, extra, data, size }
  })
  const stranded = strandedTag(layer, grouped.tags.map((tag) => tag.key))
  const chip = chipEl.value?.getBoundingClientRect()
  // The chip and the strip under it, down to the edge: on a phone the launcher's row is
  // there, and the canvas's tag, which starts in that corner, goes above the chip instead.
  const reserved: Rect[] = chip ? [{ x: chip.left, y: chip.top, w: chip.width, h: viewport.h - chip.top }] : []
  const panel = panelEl.value?.getBoundingClientRect()
  if (panel?.width) reserved.push({ x: panel.left, y: panel.top, w: panel.width, h: panel.height })
  if (stranded) reserved.push(stranded)
  const places = placeTags(
    sized.map(({ tag, size }) => ({ anchor: tag.anchor, backdrop: tag.backdrop, size })),
    viewport,
    reserved,
  )
  const shown = sized.map(({ tag, parts, extra, data, size }, i) => ({ key: tag.key, parts, count: tag.count, extra, data, ...places[i]!, ...size }))
  if (stranded) {
    // Back among the others in its old order: a node Vue moves loses focus too.
    const before = tags.value.map((tag) => tag.key)
    const next = shown.findIndex((tag) => before.indexOf(tag.key) > before.indexOf(stranded.key))
    shown.splice(next === -1 ? shown.length : next, 0, stranded)
  }
  boxes.value = grouped.boxes
  tags.value = shown
  files.value = new Set(grouped.tags.flatMap((tag) => tag.files)).size
  // After the first pass, so the region has been in the page a frame before it speaks.
  spoken.value ||= `${t(ON)} ${t(touchViewport() ? OUT.touch : OUT.keys)}`
}

/**
 * Said once, the first time the layer shows: the terminal that ran `xray` has closed by
 * then, and its output with it. The chip can't be the live region, since its count
 * changes on every scroll. Not `App.vue`'s page announcement either: importing it brings
 * the page-title module's graph into this chunk's, and the build answers by splitting a
 * content module out of the entry into one more request on first paint. Written here
 * rather than in `messages.ts`, so only this chunk carries it.
 */
const ON = {
  en: 'X-ray on: the components on screen are outlined, and their tags, after the page, link to their files.',
  fr: 'Rayons X allumés : les composants à l’écran sont entourés, et leurs étiquettes, après la page, mènent à leurs fichiers.',
}
const OUT = {
  keys: { en: 'Esc or the exit button ends it.', fr: 'Échap ou le bouton quitter pour en sortir.' },
  touch: { en: 'The exit button ends it.', fr: 'Le bouton quitter pour en sortir.' },
}
const spoken = ref('')

/** The panel's words, here rather than in `messages.ts` for the same reason as `ON`'s. */
const PATH = {
  title: { en: 'this visit’s path', fr: 'le chemin de cette visite' },
  open: { en: 'path', fr: 'chemin' },
  openLabel: { en: 'Show this visit’s path', fr: 'Montrer le chemin de cette visite' },
  close: { en: 'Close this visit’s path', fr: 'Fermer le chemin de cette visite' },
  note: {
    en: 'Read from your own browser and shown only to you; nothing is kept or sent.',
    fr: 'Lu dans votre propre navigateur et montré à vous seul ; rien n’est gardé ni envoyé.',
  },
}

let frame = 0
function schedule() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

const observer = new MutationObserver((records) => {
  const layer = layerEl.value
  if (records.some((record) => !layer?.contains(record.target))) schedule()
})

function onKeydown(event: KeyboardEvent) {
  // Every dialog that takes Esc claims it first (`preventDefault`), and so keeps it.
  if (event.key !== 'Escape' || event.defaultPrevented || hidden.value) return
  setXray(false)
}

/** Where focus was before it reached a tag, to go back to when x-ray ends. */
let returnTo: HTMLElement | null = null
function onFocusin(event: FocusEvent) {
  const from = event.relatedTarget
  if (from instanceof HTMLElement && !layerEl.value?.contains(from)) returnTo = from
}

watch([hidden, locale, fieldShapes, timings, streaming], () => schedule())

/**
 * *This visit's path* (the data-layer spec's §3): fetched when the panel opens and only
 * then, so a bare `xray` asks nothing of anyone. The trace keeps three keys and drops the
 * rest, the visitor's address among them, before anything stores it (`parseTrace`).
 */
const { xrayPath } = useXray()
const trace = shallowRef<Trace | null | undefined>(undefined)
const health = shallowRef<HealthReport | null>(null)
const lab = shallowRef<LabReport | null>(null)

async function readPath() {
  trace.value = undefined
  const [traced, healthy, labbed] = await Promise.allSettled([
    fetchSite('/cdn-cgi/trace', 'GET', { limit: 4096 }),
    api.health(),
    api.lab(),
  ])
  trace.value =
    traced.status === 'fulfilled' && traced.value.status === 200 ? parseTrace(new TextDecoder().decode(traced.value.body)) : null
  health.value = healthy.status === 'fulfilled' ? healthy.value : null
  lab.value = labbed.status === 'fulfilled' ? labbed.value : null
}

watch(
  xrayPath,
  (open) => {
    if (open) void readPath()
    schedule()
  },
  { immediate: true },
)

const hops = computed(() =>
  pathHops(
    { trace: trace.value, apiMs: newestOf(timings.value.values())?.duration, health: health.value, lab: lab.value },
    locale.value,
  ),
)

onMounted(() => {
  window.addEventListener('scroll', schedule, { capture: true, passive: true })
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('keydown', onKeydown)
  // A finished transition can move things without a mutation: a menu sliding shut.
  document.addEventListener('transitionend', schedule, true)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'inert'],
  })
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      timingObserver = new PerformanceObserver((list) => takeTimings(list.getEntries() as unknown as TimingEntry[]))
      timingObserver.observe({ type: 'resource', buffered: true })
    } catch {
      // A browser without the `type` form: the tags simply have no data lines.
    }
  }
  schedule()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', schedule, { capture: true })
  window.removeEventListener('resize', schedule)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('transitionend', schedule, true)
  observer.disconnect()
  timingObserver?.disconnect()
  cancelAnimationFrame(frame)
  if (layerEl.value?.contains(document.activeElement) && returnTo?.isConnected) returnTo.focus({ preventScroll: true })
})

const TAG_CLASS = 'whitespace-nowrap rounded-sm border border-accent/70 bg-background/90 px-1.5 text-[10px] leading-4'
</script>

<template>
  <div
    v-show="!hidden"
    ref="layerEl"
    class="fixed inset-0 z-[55] overflow-hidden pointer-events-none font-mono"
    data-testid="xray-layer"
    @focusin="onFocusin"
    @focusout="schedule"
  >
    <div aria-hidden="true">
      <div
        v-for="(box, i) in boxes"
        :key="i"
        class="absolute border border-dashed border-accent/60"
        :style="{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }"
      />
    </div>

    <!-- Each tag mirrors `tagText()` run for run, which is what its width is measured from. -->
    <nav :aria-label="t(m.xray.label)">
      <ul>
        <li
          v-for="tag in tags"
          :key="tag.key"
          :class="['absolute pointer-events-auto text-accent', TAG_CLASS]"
          :style="{ left: `${tag.x}px`, top: `${tag.y}px` }"
          :data-xray-tag="tag.key"
        >
          <template v-for="(part, i) in tag.parts" :key="part.file">
            <template v-if="i > 0">
              <span aria-hidden="true">{{ ' › ' }}</span>
              <span class="sr-only">{{ ` ${t(m.xray.through)} ` }}</span>
            </template>
            <a
              :href="sourceUrl(part.file)"
              :title="part.file"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >{{ baseName(part.file) }}</a>
            <template v-if="part.words.length">
              <span aria-hidden="true">{{ ' ← ' }}</span>
              <span class="sr-only">{{ ` ${t(m.xray.words)} ` }}</span>
              <template v-for="(word, j) in part.words" :key="word">
                <span v-if="j > 0">{{ ' ' }}</span>
                <a
                  :href="sourceUrl(word)"
                  :title="word"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="hover:underline rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >{{ baseName(word) }}</a>
              </template>
            </template>
          </template>
          <template v-if="tag.count > 1">
            <span aria-hidden="true">{{ ` ×${tag.count}` }}</span>
            <span class="sr-only">{{ ` (${t(m.xray.times).replace('{n}', String(tag.count))})` }}</span>
          </template>
          <span v-if="tag.extra" class="text-muted-foreground">{{ tag.extra }}</span>
          <!-- A line of its own on screen; read aloud, a pause, not a run-on into the count. -->
          <template v-for="data in tag.data" :key="data">
            <span class="sr-only">{{ '; ' }}</span>
            <span class="block text-muted-foreground" data-testid="xray-data">{{ data }}</span>
          </template>
        </li>
      </ul>
    </nav>

    <!-- Where the launcher sits on the other side; a phone has no Esc, so the button says how
         out. Below `md` the launcher is a 44px target 16px from the corner, and the chip
         stands above its row, with a 44px button of its own (features-spec §9). -->
    <div
      ref="chipEl"
      class="absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))_+_3.25rem)] left-4 md:bottom-6 md:left-6 pointer-events-auto flex items-center gap-2 rounded border border-accent/60 bg-background/90 backdrop-blur px-3 py-1 md:py-1.5 text-xs text-accent"
    >
      <span>{{ status }}</span>
      <span class="hidden md:inline text-muted-foreground">· {{ t(m.xray.hint) }}</span>
      <button
        type="button"
        :aria-label="t(PATH.openLabel)"
        :aria-pressed="xrayPath"
        class="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded border border-border px-1.5 text-foreground hover:border-accent hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="setXrayPath(!xrayPath)"
      >
        {{ t(PATH.open) }}
      </button>
      <button
        type="button"
        :aria-label="t(m.xray.exitLabel)"
        class="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded border border-border px-1.5 text-foreground hover:border-accent hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="setXray(false)"
      >
        {{ t(m.xray.exit) }}
      </button>
    </div>

    <!-- In the corner opposite the chip. A labelled region that takes no focus when it opens,
         as the tags don't; Esc still ends x-ray, and the close button only the panel. -->
    <section
      v-if="xrayPath"
      ref="panelEl"
      role="region"
      :aria-label="t(PATH.title)"
      class="absolute right-4 top-16 md:right-6 w-[min(24rem,calc(100vw-2rem))] pointer-events-auto rounded border border-accent/60 bg-background/95 backdrop-blur p-3 text-xs"
      data-testid="xray-path"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-accent">{{ t(PATH.title) }}</h2>
        <button
          type="button"
          :aria-label="t(PATH.close)"
          class="min-h-11 min-w-11 md:min-h-0 md:min-w-0 rounded border border-border px-1.5 text-foreground hover:border-accent hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="setXrayPath(false)"
        >
          ×
        </button>
      </div>
      <ol class="mt-2 space-y-1.5 list-decimal pl-5 marker:text-muted-foreground">
        <li v-for="hop in hops" :key="hop.id" :data-hop="hop.id">
          <span class="text-foreground">{{ hop.path }}</span>
          <span v-if="hop.detail" class="block text-muted-foreground">{{ hop.detail }}</span>
        </li>
      </ol>
      <p class="mt-2 text-muted-foreground">{{ t(PATH.note) }}</p>
    </section>

    <p class="sr-only" role="status">{{ spoken }}</p>

    <span ref="probeEl" aria-hidden="true" :class="['invisible absolute left-0 top-0', TAG_CLASS]"
      ><span ref="probeTextEl">{{ PROBE }}</span></span
    >
  </div>
</template>
