<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WindowDots from '@/components/WindowDots.vue'
import { decorativeMotion } from '@/composables/useMotion'
import { useStemsRequest } from '@/composables/useStemsRequest'
import { useTheme } from '@/composables/useTheme'
import { stemTracks, type StemTrack } from '@/content/stems'
import type { Localised } from '@/content/types'
import { useLocale } from '@/i18n'
import { closeAfterFade, openAudioContext } from '@/tools/acid/audio'
import { formatBytes } from '@/tools/image/image'
import { createStemsEngine, type StemsEngine } from './engine'
import { stemsLabels as labels } from './labels'
import { downloadBytes, loadStems } from './load'
import { decodeMix, defaultMix, encodeMix, gains, type Mix } from './mix'
import {
  chainLine,
  decodePeaks,
  laneBars,
  linerLine,
  playheadInterval,
  positionText,
  seekFraction,
  transportStep,
  type Peaks,
} from './peaks'

/**
 * The stems of one of Jules's tracks on faders (`content/stems.ts`). Mounted by the music
 * section only while there is a track to mix, and loaded as its own chunk. A mix travels
 * as `/?mix=<code>#music`, which is read once and dropped from the address, as `?run=` is;
 * the terminal's `stems <id>` hands one over the same way.
 *
 * Vol. 2 (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md`): a waveform lane per
 * stem from `peaks.json`, fetched when the mixer mounts, before any audio, so the 4 kB
 * preview shows what the megabytes will be; one playhead across them; seeking from a lane
 * or the transport; and the track's liner notes.
 */

const { t, locale } = useLocale()
const route = useRoute()
const router = useRouter()
const { theme } = useTheme()
const { requested, take } = useStemsRequest()

const track = shallowRef<StemTrack>(stemTracks[0]!)
const mix = ref<Mix>(defaultMix(track.value.stems.length))
const status = ref<'idle' | 'loading' | 'ready' | 'failed' | 'noAudio'>('idle')
const progress = ref(0)
const playing = ref(false)
/** Seconds into the excerpt. */
const seconds = ref(0)
const notice = ref<Localised | null>(null)
const copied = ref(false)
const peaks = shallowRef<Peaks | null>(null)
const lanes = ref<HTMLCanvasElement[]>([])
const laneBox = ref<HTMLElement | null>(null)

let context: AudioContext | null = null
let engine: StemsEngine | null = null
let loading: AbortController | null = null
let clock: number | undefined
let frame = 0
let resize: ResizeObserver | undefined

const length = computed(() => engine?.length ?? track.value.seconds)
const step = computed(() => transportStep(track.value))

function stopClock() {
  window.clearInterval(clock)
  cancelAnimationFrame(frame)
  clock = undefined
  frame = 0
}

/**
 * The playhead follows the motion level: every frame at *full*, ten times a second at
 * *calm*, once a second at *paused*. It is information, not decoration, but it moves.
 */
function startClock() {
  stopClock()
  const read = () => {
    seconds.value = engine ? engine.position() : 0
  }
  const every = playheadInterval(decorativeMotion())
  if (every === null) {
    const tick = () => {
      read()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  } else {
    clock = window.setInterval(read, every)
  }
}

function release() {
  loading?.abort()
  loading = null
  stopClock()
  engine?.dispose()
  engine = null
  if (context) closeAfterFade(context)
  context = null
  playing.value = false
  seconds.value = 0
}

async function load() {
  // In the click's own call stack, before any `await`: Safari only lets a context start
  // there (`tools/acid/audio.ts`).
  const audio = openAudioContext()
  if (!audio) {
    status.value = 'noAudio'
    return
  }
  context = audio
  status.value = 'loading'
  progress.value = 0
  const controller = new AbortController()
  loading = controller
  try {
    const buffers = await loadStems(audio, track.value, (fraction) => (progress.value = fraction), controller.signal)
    // A track change or leaving the page while the last file decoded, which no signal
    // can stop: `release()` has already reset everything, and these buffers are stale.
    if (controller.signal.aborted) return
    engine = createStemsEngine(audio, buffers, mix.value, {
      seconds: track.value.seconds,
      onStop(reason) {
        playing.value = false
        stopClock()
        if (reason === 'hidden') notice.value = labels.hidden
      },
    })
    // A seek made before the audio arrived is where play starts.
    engine.seek(seconds.value)
    status.value = 'ready'
  } catch {
    if (!controller.signal.aborted) {
      release()
      status.value = 'failed'
    }
  } finally {
    if (loading === controller) loading = null
  }
}

function toggle() {
  if (!engine) return
  if (engine.playing) {
    engine.pause()
    return
  }
  notice.value = null
  engine.play()
  playing.value = engine.playing
  if (playing.value) startClock()
}

function seek(to: number) {
  seconds.value = Math.min(Math.max(0, to), length.value)
  engine?.seek(seconds.value)
}

/** A click on any lane seeks, and so does dragging across them. */
let dragging = false
function onLanePointer(event: PointerEvent) {
  // Only a lane: the faders and buttons in the same rows keep their own pointer.
  const lane = (event.target as HTMLElement).closest<HTMLElement>('[data-lane]')
  if (event.type === 'pointerdown' && lane) {
    dragging = true
    lane.setPointerCapture?.(event.pointerId)
  }
  if (dragging && lane) seek(seekFraction(event.clientX, lane.getBoundingClientRect()) * length.value)
  if (event.type === 'pointerup' || event.type === 'pointercancel') dragging = false
}

/**
 * Each lane from the peaks, in the scheme's own colour, read at draw time: `theme` swaps
 * every token, and a colour cached on mount would be the last scheme's.
 */
function draw() {
  const file = peaks.value
  const colour = getComputedStyle(document.documentElement).getPropertyValue('--neon-green').trim() || '#00ff41'
  const ratio = window.devicePixelRatio || 1
  track.value.stems.forEach((stem, i) => {
    const canvas = lanes.value[i]
    if (!canvas) return
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)
    if (!width || !height) return
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    const lane = file?.stems[stem.id]
    if (!lane) return
    ctx.fillStyle = colour
    laneBars(lane, width, height).forEach((bar, x) => ctx.fillRect(x, (height - bar) / 2, 1, bar))
  })
}

async function fetchPeaks(of: StemTrack) {
  peaks.value = null
  try {
    const response = await fetch(`/stems/${of.id}/peaks.json`)
    if (!response.ok) return
    const decoded = decodePeaks(await response.json(), of)
    // The track may have changed while it came.
    if (of === track.value) peaks.value = decoded
  } catch {
    // No picture: the lanes stay blank and the faders still work.
  }
}

watch(
  mix,
  (next) => {
    engine?.set(next)
    copied.value = false
  },
  { deep: true },
)

watch(track, (next) => void fetchPeaks(next))
watch([peaks, theme], () => void nextTick(draw))

/** A lane fades with its gain, so a muted stem's waveform greys out. */
const laneOpacity = computed(() => gains(mix.value).map((gain) => 0.25 + 0.75 * gain))

function select(next: StemTrack, nextMix: Mix) {
  if (next !== track.value) {
    release()
    track.value = next
    status.value = 'idle'
  }
  mix.value = nextMix
}

function pick(id: string) {
  const next = stemTracks.find((candidate) => candidate.id === id)
  if (!next || next === track.value) return
  select(next, defaultMix(next.stems.length))
  notice.value = null
}

function reset() {
  mix.value = defaultMix(track.value.stems.length)
}

async function copy() {
  const link = `${window.location.origin}/?mix=${encodeMix(track.value.id, mix.value)}#music`
  try {
    await navigator.clipboard.writeText(link)
    copied.value = true
  } catch {
    // No clipboard here: nothing to show for it, and the mix is still on screen.
  }
}

/** A mix code from a link or from `stems <id>`: the one path either takes. */
function apply(code: string, fromLink: boolean): void {
  const decoded = decodeMix(code, stemTracks)
  if (!decoded) {
    notice.value = labels.badLink
    return
  }
  select(decoded.track, decoded.mix)
  notice.value = fromLink ? labels.fromLink : null
}

watch(
  requested,
  (code) => {
    if (!code) return
    take()
    apply(code, false)
  },
  { immediate: true },
)

const percent = (value: number) => Math.round(value * 100)
const size = computed(() => formatBytes(downloadBytes(track.value)))
const fill = (name: string, message: Localised) => t(message).replace('{name}', name)

onMounted(async () => {
  void fetchPeaks(track.value)
  if (typeof ResizeObserver !== 'undefined' && laneBox.value) {
    resize = new ResizeObserver(() => draw())
    resize.observe(laneBox.value)
  }
  await router.isReady()
  const raw = route.query.mix
  const code = Array.isArray(raw) ? raw[0] : raw
  if (typeof code !== 'string' || !code) return
  // Read once: a reload or a bookmark shouldn't carry it, as with `?run=`.
  const query = { ...route.query }
  delete query.mix
  void router.replace({ path: route.path, hash: route.hash, query })
  apply(code, true)
})

onUnmounted(() => {
  resize?.disconnect()
  release()
})
</script>

<template>
  <div class="rounded border border-border bg-card overflow-hidden" data-testid="stems-mixer">
    <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
      <WindowDots />
      <span class="ml-3 text-xs text-muted-foreground truncate">mixer — {{ linerLine(track) }}</span>
    </div>

    <div class="p-4 space-y-4 font-mono text-xs">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 class="text-sm text-accent">{{ t(labels.heading) }}</h3>
        <label v-if="stemTracks.length > 1" class="flex items-center gap-2 text-muted-foreground">
          {{ t(labels.track) }}
          <select
            :value="track.id"
            class="bg-background border border-border rounded px-2 py-1 text-foreground"
            @change="pick(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in stemTracks" :key="option.id" :value="option.id">{{ option.title }}</option>
          </select>
        </label>
        <a v-if="track.url" :href="track.url" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">{{ track.title }} ↗</a>
      </div>
      <p v-if="track.note" class="text-muted-foreground leading-relaxed">{{ t(track.note) }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="status !== 'ready'"
          type="button"
          class="px-3 py-1 rounded border border-border text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
          :disabled="status === 'loading' || status === 'noAudio'"
          @click="load"
        >
          {{ status === 'loading' ? t(labels.loading).replace('{n}', String(percent(progress))) : t(labels.load).replace('{size}', size) }}
        </button>
        <button
          v-else
          type="button"
          class="px-3 py-1 rounded border border-primary/60 text-primary hover:bg-primary/10 transition-colors"
          :aria-pressed="playing"
          @click="toggle"
        >
          <span aria-hidden="true">{{ playing ? '■' : '▶' }}</span> {{ playing ? t(labels.pause) : t(labels.play) }}
        </button>
        <!-- The keyboard's way to seek: arrows step a bar when the track has a tempo. -->
        <input
          type="range"
          min="0"
          :max="length"
          :step="step"
          :value="seconds"
          class="min-w-24 flex-1 accent-[var(--neon-green)]"
          :aria-label="t(labels.position)"
          :aria-valuetext="positionText(seconds, length, locale)"
          data-testid="stems-transport"
          @input="seek(Number(($event.target as HTMLInputElement).value))"
        />
        <span class="shrink-0 text-muted-foreground tabular-nums" aria-hidden="true">{{ positionText(seconds, length, locale) }}</span>
      </div>
      <p v-if="status === 'failed'" class="text-warning" role="alert">{{ t(labels.failed) }}</p>
      <p v-else-if="status === 'noAudio'" class="text-warning" role="alert">{{ t(labels.noAudio) }}</p>
      <p v-if="notice" class="text-muted-foreground" aria-live="polite">{{ t(notice) }}</p>

      <ul
        ref="laneBox"
        class="space-y-2"
        @pointerdown="onLanePointer"
        @pointermove="onLanePointer"
        @pointerup="onLanePointer"
        @pointercancel="onLanePointer"
      >
        <li v-for="(stem, i) in track.stems" :key="stem.id" class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-24 shrink-0 truncate text-foreground">{{ t(stem.name) }}</span>
            <!-- The picture: the row's controls are what assistive technology reads. -->
            <div class="relative h-7 min-w-0 flex-1 cursor-pointer rounded bg-muted/40" data-lane aria-hidden="true">
              <canvas
                :ref="(el) => { if (el) lanes[i] = el as HTMLCanvasElement }"
                class="absolute inset-0 h-full w-full transition-opacity"
                :style="{ opacity: laneOpacity[i] }"
              ></canvas>
              <div class="absolute inset-y-0 w-px bg-accent" :style="{ left: `${(seconds / length) * 100}%` }"></div>
            </div>
            <button
              type="button"
              class="w-9 py-1 rounded border transition-colors"
              :class="mix.stems[i]!.muted ? 'border-warning text-warning' : 'border-border text-muted-foreground hover:text-foreground'"
              :aria-pressed="mix.stems[i]!.muted"
              :aria-label="fill(t(stem.name), labels.mute)"
              @click="mix.stems[i]!.muted = !mix.stems[i]!.muted"
            >
              M
            </button>
            <button
              type="button"
              class="w-9 py-1 rounded border transition-colors"
              :class="mix.stems[i]!.solo ? 'border-accent text-accent' : 'border-border text-muted-foreground hover:text-foreground'"
              :aria-pressed="mix.stems[i]!.solo"
              :aria-label="fill(t(stem.name), labels.solo)"
              @click="mix.stems[i]!.solo = !mix.stems[i]!.solo"
            >
              S
            </button>
            <input
              v-model.number="mix.stems[i]!.level"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="w-24 shrink-0 accent-[var(--neon-green)]"
              :aria-label="fill(t(stem.name), labels.level)"
            />
            <span class="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{{ percent(mix.stems[i]!.level) }}</span>
          </div>
          <details v-if="stem.chain?.length" class="pl-26 text-muted-foreground">
            <summary class="cursor-pointer w-fit hover:text-foreground">{{ t(labels.chain) }}</summary>
            <p class="mt-1 text-foreground">{{ chainLine(stem.chain) }}</p>
          </details>
        </li>
        <li class="flex items-center gap-2 pt-2 border-t border-border">
          <span class="w-24 shrink-0 text-foreground">{{ t(labels.filter) }}</span>
          <input v-model.number="mix.cutoff" type="range" min="0" max="1" step="0.01" class="min-w-0 flex-1 accent-[var(--neon-green)]" :aria-label="t(labels.filter)" />
          <span class="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{{ percent(mix.cutoff) }}</span>
        </li>
      </ul>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-foreground hover:border-primary hover:text-primary transition-colors"
          @click="copy"
        >
          {{ copied ? t(labels.copied) : t(labels.copy) }}
        </button>
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          @click="reset"
        >
          {{ t(labels.reset) }}
        </button>
      </div>
    </div>
  </div>
</template>
