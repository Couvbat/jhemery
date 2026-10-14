<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WindowDots from '@/components/WindowDots.vue'
import { stemTracks, type StemTrack } from '@/content/stems'
import type { Localised } from '@/content/types'
import { useLocale } from '@/i18n'
import { closeAfterFade, openAudioContext } from '@/tools/acid/audio'
import { formatBytes } from '@/tools/image/image'
import { createStemsEngine, type StemsEngine } from './engine'
import { stemsLabels as labels } from './labels'
import { downloadBytes, loadStems } from './load'
import { decodeMix, defaultMix, encodeMix, type Mix } from './mix'

/**
 * The stems of one of Jules's tracks on faders (`content/stems.ts`). Mounted by the music
 * section only while there is a track to mix, and loaded as its own chunk. A mix travels
 * as `/?mix=<code>#music`, which is read once and dropped from the address, as `?run=` is.
 */

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const track = shallowRef<StemTrack>(stemTracks[0]!)
const mix = ref<Mix>(defaultMix(track.value.stems.length))
const status = ref<'idle' | 'loading' | 'ready' | 'failed' | 'noAudio'>('idle')
const progress = ref(0)
const playing = ref(false)
const position = ref(0)
const notice = ref<Localised | null>(null)
const copied = ref(false)

let context: AudioContext | null = null
let engine: StemsEngine | null = null
let loading: AbortController | null = null
let clock: number | undefined

function release() {
  loading?.abort()
  loading = null
  window.clearInterval(clock)
  engine?.dispose()
  engine = null
  if (context) closeAfterFade(context)
  context = null
  playing.value = false
  position.value = 0
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
      onStop(reason) {
        playing.value = false
        window.clearInterval(clock)
        if (reason === 'hidden') notice.value = labels.hidden
      },
    })
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
  if (!playing.value) return
  // The playhead, four times a second: it is a read-out, not an animation.
  clock = window.setInterval(() => {
    position.value = engine ? engine.position() / engine.length : 0
  }, 250)
}

watch(
  mix,
  (next) => {
    engine?.set(next)
    copied.value = false
  },
  { deep: true },
)

function pick(id: string) {
  const next = stemTracks.find((candidate) => candidate.id === id)
  if (!next || next === track.value) return
  release()
  track.value = next
  mix.value = defaultMix(next.stems.length)
  status.value = 'idle'
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

const percent = (value: number) => Math.round(value * 100)
const size = computed(() => formatBytes(downloadBytes(track.value)))
const fill = (name: string, message: Localised) => t(message).replace('{name}', name)

onMounted(async () => {
  await router.isReady()
  const raw = route.query.mix
  const code = Array.isArray(raw) ? raw[0] : raw
  if (typeof code !== 'string' || !code) return
  // Read once: a reload or a bookmark shouldn't carry it, as with `?run=`.
  const query = { ...route.query }
  delete query.mix
  void router.replace({ path: route.path, hash: route.hash, query })
  const decoded = decodeMix(code, stemTracks)
  if (!decoded) {
    notice.value = labels.badLink
    return
  }
  track.value = decoded.track
  mix.value = decoded.mix
  notice.value = labels.fromLink
})

onUnmounted(release)
</script>

<template>
  <div class="rounded border border-border bg-card overflow-hidden" data-testid="stems-mixer">
    <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
      <WindowDots />
      <span class="ml-3 text-xs text-muted-foreground">mixer — {{ track.title }}</span>
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
        <div v-if="status === 'ready'" class="h-1 flex-1 min-w-24 rounded bg-muted overflow-hidden" aria-hidden="true">
          <div class="h-full bg-primary" :style="{ width: `${percent(position)}%` }"></div>
        </div>
      </div>
      <p v-if="status === 'failed'" class="text-warning" role="alert">{{ t(labels.failed) }}</p>
      <p v-else-if="status === 'noAudio'" class="text-warning" role="alert">{{ t(labels.noAudio) }}</p>
      <p v-if="notice" class="text-muted-foreground" aria-live="polite">{{ t(notice) }}</p>

      <ul class="space-y-2">
        <li
          v-for="(stem, i) in track.stems"
          :key="stem.id"
          class="flex items-center gap-2"
        >
          <span class="w-24 shrink-0 truncate text-foreground">{{ t(stem.name) }}</span>
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
            class="min-w-0 flex-1 accent-[var(--neon-green)]"
            :aria-label="fill(t(stem.name), labels.level)"
          />
          <span class="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{{ percent(mix.stems[i]!.level) }}</span>
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
