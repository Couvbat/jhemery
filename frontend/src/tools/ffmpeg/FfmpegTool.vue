<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useLocale } from '@/i18n'
import ToolFrame from '../ToolFrame.vue'
import { formatBytes } from '../image/image'
import { FfmpegError, createEngine, warmCache, type Engine } from './core'
import {
  CORE_BYTES,
  PRESETS,
  blocker,
  buildArgs,
  findPreset,
  formatTimecode,
  outputFor,
  outputName,
  parseProbe,
  progressRatio,
  trimWindow,
  type Kind,
  type Probe,
} from './media'

const { t, m } = useLocale()

/**
 * The panel is a small state machine around one `Engine`. Nothing is fetched until
 * `load()` — the visitor presses the button, the spec's explicit download step — and
 * the drop zone only appears once the core has started, so there is never a file
 * waiting on an engine that may not come.
 */
type Phase = 'idle' | 'downloading' | 'starting' | 'ready' | 'failed'
const phase = ref<Phase>('idle')
const received = ref(0)
const total = ref(CORE_BYTES)
let engine: Engine | null = null

interface Source {
  file: File
  probe: Probe
}
const source = ref<Source | null>(null)
const probing = ref(false)
const presetId = ref('mp3')
const start = ref('')
const end = ref('')
const dragging = ref(false)

interface Running {
  since: number
  micros: number
}
const running = ref<Running | null>(null)
const elapsed = ref(0)
/** True between `cancel()` and the new engine being ready; the panel stays in its
 *  ready layout, greyed, rather than falling back to the download screen. */
const restarting = ref(false)
let cancelling = false
let ticker: ReturnType<typeof setInterval> | undefined

interface Result {
  blob: Blob
  url: string
  name: string
  kind: Kind
  seconds: number
}
const result = ref<Result | null>(null)
const error = ref<string | null>(null)

const preset = computed(() => findPreset(presetId.value) ?? PRESETS[0]!)
const cut = computed(() => trimWindow(start.value, end.value, source.value?.probe.duration ?? null))
const blocked = computed(() => (source.value ? blocker(preset.value, source.value.probe) : null))
const busy = computed(() => probing.value || running.value !== null || restarting.value)
const canConvert = computed(
  () => phase.value === 'ready' && source.value !== null && !busy.value && blocked.value === null && cut.value.error === null,
)

const downloadPercent = computed(() => Math.round((received.value / total.value) * 100))

/** The expected output length, for the progress ratio: the cut, else the whole file. */
const expectedSeconds = computed(() => {
  const probe = source.value?.probe
  if (!probe) return null
  const window = cut.value.cut
  if (window?.length != null) return window.length
  if (window && probe.duration !== null) return probe.duration - window.start
  return probe.duration
})
const ratio = computed(() => (running.value ? progressRatio(running.value.micros, expectedSeconds.value) : null))

const summary = computed(() => {
  const current = source.value
  if (!current) return ''
  const { probe, file } = current
  const parts = [formatBytes(file.size)]
  if (probe.duration !== null) parts.push(formatTimecode(probe.duration, 1))
  if (probe.video) {
    const { codec, width, height, fps } = probe.video
    parts.push(`${codec} ${width}×${height}${fps ? ` ${fps} fps` : ''}`)
  }
  if (probe.audio) {
    const { codec, sampleRate, channels } = probe.audio
    parts.push(`${codec}${sampleRate ? ` ${sampleRate / 1000} kHz` : ''}${channels ? ` ${channels}ch` : ''}`)
  }
  return parts.join(' · ')
})

async function load() {
  phase.value = 'downloading'
  error.value = null
  received.value = 0
  try {
    await warmCache((got, size) => {
      received.value = got
      total.value = size
    })
    phase.value = 'starting'
    engine = await createEngine()
    phase.value = 'ready'
  } catch {
    engine = null
    phase.value = 'failed'
  }
}

function clearResult() {
  if (result.value) URL.revokeObjectURL(result.value.url)
  result.value = null
}

async function onFile(file: File | undefined) {
  if (!file || !engine || busy.value) return
  error.value = null
  clearResult()
  probing.value = true
  try {
    const probe = parseProbe(await engine.probe(file))
    if (!probe || probe.streams.length === 0) {
      source.value = null
      error.value = t(m.toolFfmpeg.notMedia)
      return
    }
    source.value = { file, probe }
    // A song offered `mp4` would only ever be refused; start it on something that fits.
    if (!probe.video && preset.value.kind !== 'audio') presetId.value = 'mp3'
  } catch (caught) {
    source.value = null
    if (caught instanceof FfmpegError) error.value = describe(caught)
    else void restart(t(m.toolFfmpeg.crashed), true)
  } finally {
    probing.value = false
  }
}

/** ffmpeg's own last line is the useful part of a failure. */
function describe(caught: FfmpegError): string {
  const last = caught.log.at(-1)
  return `${t(m.toolFfmpeg.failed)} ${caught.code}${last ? ` — ${last}` : ''}`
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void onFile(event.dataTransfer?.files[0])
}

function onPick(event: Event) {
  void onFile((event.target as HTMLInputElement).files?.[0])
}

async function convert() {
  const current = source.value
  if (!current || !engine || !canConvert.value) return
  const window = cut.value.cut
  const chosen = preset.value
  const { ext, mime } = outputFor(chosen, current.probe)
  const since = performance.now()
  running.value = { since, micros: 0 }
  elapsed.value = 0
  ticker = setInterval(() => {
    elapsed.value = (performance.now() - since) / 1000
  }, 250)
  error.value = null
  clearResult()
  try {
    const data = await engine.run(
      current.file,
      (input) => buildArgs(input, chosen, window),
      `/out.${ext}`,
      (micros) => {
        if (running.value) running.value.micros = micros
      },
    )
    const blob = new Blob([data as BlobPart], { type: mime })
    result.value = {
      blob,
      url: URL.createObjectURL(blob),
      name: outputName(current.file.name, ext, window !== null),
      kind: chosen.kind,
      seconds: (performance.now() - since) / 1000,
    }
  } catch (caught) {
    if (cancelling) return
    if (caught instanceof FfmpegError) error.value = describe(caught)
    else void restart(t(m.toolFfmpeg.crashed), true)
  } finally {
    clearInterval(ticker)
    running.value = null
  }
}

/**
 * Kills the worker and starts a fresh one. Two callers: cancel, because the only way
 * to stop ffmpeg mid-file is to kill it; and any rejection that is not an
 * `FfmpegError`, because that means the core itself trapped (`memory access out of
 * bounds` is what libopus did) and a wasm instance that has trapped once fails every
 * call after it — the probe of the next file included. The core is in the browser
 * cache by now, so a restart is the compile step only, a second or two. `keep` leaves
 * the message up once the new engine is ready; a cancellation clears its own.
 */
async function restart(message: string, keep: boolean) {
  restarting.value = true
  engine?.terminate()
  engine = null
  error.value = message
  try {
    engine = await createEngine()
    if (!keep) error.value = null
  } catch {
    phase.value = 'failed'
  } finally {
    restarting.value = false
  }
}

async function cancel() {
  if (!engine || !running.value) return
  cancelling = true
  try {
    await restart(t(m.toolFfmpeg.cancelled), false)
  } finally {
    cancelling = false
  }
}

onUnmounted(() => {
  clearInterval(ticker)
  clearResult()
  engine?.terminate()
  engine = null
})
</script>

<template>
  <ToolFrame title="ffmpeg.sh">
    <template #status>
      <span v-if="phase === 'downloading'">{{ t(m.toolFfmpeg.downloading) }} {{ downloadPercent }}%</span>
      <span v-else-if="phase === 'starting' || restarting">{{ t(m.toolFfmpeg.starting) }}</span>
      <span v-else-if="running">{{ t(m.tools.working) }}</span>
      <span v-else-if="probing">{{ t(m.toolFfmpeg.probing) }}</span>
      <span v-else-if="phase === 'ready'" class="text-primary">{{ t(m.toolFfmpeg.ready) }}</span>
    </template>

    <template v-if="phase !== 'ready'">
      <p class="text-muted-foreground">{{ t(m.toolFfmpeg.intro) }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <button
          v-if="phase === 'idle' || phase === 'failed'"
          type="button"
          class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
          @click="load"
        >
          {{ t(m.toolFfmpeg.download) }} ({{ formatBytes(CORE_BYTES) }})
        </button>
        <div
          v-else
          class="flex-1 min-w-48 h-2 rounded bg-muted overflow-hidden"
          role="progressbar"
          :aria-valuenow="phase === 'downloading' ? downloadPercent : undefined"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t(m.toolFfmpeg.downloading)"
        >
          <div
            class="h-full bg-primary transition-[width] duration-200"
            :class="phase === 'starting' && 'animate-pulse'"
            :style="{ width: phase === 'downloading' ? `${downloadPercent}%` : '100%' }"
          ></div>
        </div>
      </div>

      <p v-if="phase === 'failed'" class="text-xs text-destructive">{{ t(m.toolFfmpeg.loadFailed) }}</p>
    </template>

    <template v-else>
      <label
        class="flex flex-col items-center justify-center gap-1 rounded border border-dashed px-4 py-8 text-center transition-colors"
        :class="[
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          busy ? 'opacity-60 cursor-wait' : 'cursor-pointer',
        ]"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <span class="text-muted-foreground">
          {{ t(m.tools.dropFile) }} <span class="text-primary underline">{{ t(m.tools.browse) }}</span>
        </span>
        <span v-if="source" class="text-xs text-foreground">{{ source.file.name }} · {{ summary }}</span>
        <input
          type="file"
          accept="audio/*,video/*,.mkv,.ts,.flac,.opus,.m4a,.aac,.wav,.ogg"
          class="sr-only"
          :disabled="busy"
          @change="onPick"
        />
      </label>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="space-y-1">
          <label for="ffmpeg-format" class="text-xs text-muted-foreground">--{{ t(m.toolFfmpeg.format) }}</label>
          <select
            id="ffmpeg-format"
            v-model="presetId"
            :disabled="busy"
            class="w-full h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none disabled:opacity-60"
          >
            <option v-for="p in PRESETS" :key="p.id" :value="p.id" class="bg-card">{{ p.id }} — {{ p.note }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label for="ffmpeg-start" class="text-xs text-muted-foreground">
            --{{ t(m.toolFfmpeg.trim) }} {{ t(m.toolFfmpeg.start) }}
          </label>
          <input
            id="ffmpeg-start"
            v-model="start"
            type="text"
            inputmode="decimal"
            placeholder="0:00"
            :disabled="busy"
            class="w-full h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none disabled:opacity-60"
          />
        </div>
        <div class="space-y-1">
          <label for="ffmpeg-end" class="text-xs text-muted-foreground">
            --{{ t(m.toolFfmpeg.trim) }} {{ t(m.toolFfmpeg.end) }}
          </label>
          <input
            id="ffmpeg-end"
            v-model="end"
            type="text"
            inputmode="decimal"
            :placeholder="source?.probe.duration ? formatTimecode(source.probe.duration, 1) : '∞'"
            :disabled="busy"
            class="w-full h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none disabled:opacity-60"
          />
        </div>
      </div>
      <p class="text-xs text-muted-foreground -mt-2">{{ t(m.toolFfmpeg.trimHint) }}</p>

      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <p v-else-if="source && blocked" class="text-xs text-yellow-400">{{ t(m.toolFfmpeg[blocked]) }}</p>
      <p v-else-if="source && cut.error" class="text-xs text-yellow-400">
        {{ t(m.toolFfmpeg[cut.error === 'start' ? 'badStart' : cut.error === 'end' ? 'badEnd' : 'badOrder']) }}
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <button
          v-if="!running"
          type="button"
          :disabled="!canConvert"
          class="px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          @click="convert"
        >
          {{ t(m.toolFfmpeg.convert) }}
        </button>
        <button
          v-else
          type="button"
          class="px-3 py-1.5 rounded border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
          @click="cancel"
        >
          {{ t(m.toolFfmpeg.cancel) }}
        </button>
        <template v-if="running">
          <div
            class="flex-1 min-w-32 h-2 rounded bg-muted overflow-hidden"
            role="progressbar"
            :aria-valuenow="ratio === null ? undefined : Math.round(ratio * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="t(m.tools.working)"
          >
            <div
              class="h-full bg-primary transition-[width] duration-200"
              :class="ratio === null && 'animate-pulse'"
              :style="{ width: ratio === null ? '100%' : `${Math.round(ratio * 100)}%` }"
            ></div>
          </div>
          <span class="text-xs text-muted-foreground tabular-nums">
            <template v-if="ratio !== null">{{ Math.round(ratio * 100) }}% · </template>{{ elapsed.toFixed(0) }} s
          </span>
        </template>
      </div>

      <figure v-if="result" class="space-y-2">
        <audio v-if="result.kind === 'audio'" controls :src="result.url" class="w-full"></audio>
        <video
          v-else-if="result.kind === 'video'"
          controls
          :src="result.url"
          class="max-h-72 w-full rounded border border-primary/40 bg-black/40"
        ></video>
        <img v-else :src="result.url" alt="" class="max-h-72 w-full object-contain rounded border border-primary/40 bg-black/40" />
        <figcaption class="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
          <span>
            {{ t(m.toolFfmpeg.result) }} · {{ formatBytes(result.blob.size) }} · {{ t(m.toolFfmpeg.elapsed) }}
            {{ result.seconds.toFixed(1) }} s
          </span>
          <a
            :href="result.url"
            :download="result.name"
            class="ml-auto px-2 py-0.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
          >
            {{ t(m.tools.download) }} {{ result.name }}
          </a>
        </figcaption>
      </figure>

      <p class="text-xs text-muted-foreground">{{ t(m.toolFfmpeg.slow) }}</p>
    </template>
  </ToolFrame>
</template>
