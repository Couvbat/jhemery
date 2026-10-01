<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { prefersReducedMotion } from '@/composables/useCrt'
import { useLocale } from '@/i18n'
import { copyText } from '../clipboard'
import ToolFrame from '../ToolFrame.vue'
import { closeAfterFade, openAudioContext } from './audio'
import { createEngine, voiceOf, type AcidEngine, type StopReason } from './engine'
import {
  KNOBS,
  MAX_BPM,
  MIN_BPM,
  NOTE_NAMES,
  DEFAULT_PATTERN,
  clonePattern,
  decode,
  encode,
  fromOffset,
  offsetOf,
  pitchName,
  randomise,
  type Knob,
  type Step,
  type Wave,
} from './pattern'

const { t, m, locale } = useLocale()
const route = useRoute()

type Notice = 'invalid' | 'noAudio' | 'hidden' | 'replaced'
const notice = ref<Notice | null>(null)

// `?p=` is read once, when the panel mounts. Nothing writes it back: the share link is
// built when it is copied (`share()`), because a `router.replace` on every knob drag
// would trip the router's `scrollBehavior`, which goes to the top on every navigation.
const pattern = reactive(clonePattern(DEFAULT_PATTERN))
{
  const query = route.query.p
  const code = Array.isArray(query) ? query[0] : query
  if (typeof code === 'string' && code) {
    const decoded = decode(code)
    if (decoded) Object.assign(pattern, decoded)
    else notice.value = 'invalid'
  }
}

const playing = ref(false)
const playhead = ref(-1)
// The playhead jumps up to twenty times a second at the top of the tempo range, so it is
// left out under reduced motion; the status still says the pattern is playing.
const follows = !prefersReducedMotion()

let context: AudioContext | null = null
let engine: AcidEngine | null = null
let frame = 0

function follow() {
  playhead.value = engine?.position() ?? -1
  frame = requestAnimationFrame(follow)
}

function onStop(reason: StopReason) {
  playing.value = false
  cancelAnimationFrame(frame)
  playhead.value = -1
  if (reason !== 'user') notice.value = reason
}

function toggle() {
  if (playing.value) {
    engine?.stop()
    return
  }
  // Inside the click, before anything awaits: the only moment a browser lets a context
  // start (see `openAudioContext`). Made on the first press, and kept until the panel
  // closes, so the second press resumes it rather than opening another.
  if (!engine) {
    context = openAudioContext()
    if (!context) {
      notice.value = 'noAudio'
      return
    }
    // The raw object rather than the proxy: the scheduler reads it twenty times a
    // second, and every edit made through the proxy lands in it all the same.
    engine = createEngine(context, () => toRaw(pattern), { onStop })
  }
  notice.value = null
  engine.start()
  // Read back rather than assumed: a start refused (a hidden tab) has already said why.
  playing.value = engine.playing
  if (playing.value && follows) follow()
}

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  engine?.dispose()
  if (context) closeAfterFade(context)
})

function shuffle() {
  pattern.steps = randomise(toRaw(pattern)).steps
}

const shared = ref<{ url: string; code: string; copied: boolean } | null>(null)

async function share() {
  const code = encode(toRaw(pattern))
  const url = `${location.origin}/tools/acid?p=${code}`
  shared.value = { url, code, copied: await copyText(url) }
}

// A link shown after the pattern changed would hand out the old one.
watch(pattern, () => (shared.value = null), { deep: true })

const shellHint = computed(() => t(m.toolAcid.shell).split('{command}'))

const label = (message: { en: string; fr: string }, i: number) => t(message).replace('{n}', String(i + 1))

/** Every pitch a step can take, an octave below the root to two above it. */
const pitches = computed(() =>
  Array.from({ length: 37 }, (_, i) => {
    const offset = i - 12
    return { offset, name: pitchName(36 + pattern.root + offset) }
  }),
)

function onPitch(step: Step, event: Event) {
  Object.assign(step, fromOffset(Number((event.target as HTMLSelectElement).value)))
}

const WAVES: Wave[] = ['saw', 'square']

const voice = computed(() => voiceOf(pattern.knobs))
const number = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }))

/** A knob in the units the engine turns it into, so the slider says what it does. */
function readout(knob: Knob): string {
  const v = voice.value
  const n = number.value
  switch (knob) {
    case 'cutoff':
      return v.cutoff >= 1000 ? `${n.format(v.cutoff / 1000)} kHz` : `${Math.round(v.cutoff)} Hz`
    case 'resonance':
      return `${n.format(v.resonance)} dB`
    case 'envMod':
      return `+${n.format(v.envMod)} oct`
    case 'decay':
      return `${Math.round(v.decay * 1000)} ms`
    default:
      return `${Math.round((pattern.knobs[knob] / 255) * 100)} %`
  }
}
</script>

<template>
  <ToolFrame title="acid.sh">
    <template #status>
      <span v-if="playing" class="text-primary">{{ t(m.toolAcid.playing) }} · {{ pattern.bpm }} bpm</span>
    </template>

    <p v-if="notice" class="text-xs text-warning" role="status">{{ t(m.toolAcid[notice]) }}</p>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        data-testid="acid-play"
        class="h-9 min-w-24 px-4 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
        @click="toggle"
      >
        <span aria-hidden="true">{{ playing ? '■' : '▶' }}</span>
        {{ playing ? t(m.toolAcid.stop) : t(m.toolAcid.play) }}
      </button>
      <button
        type="button"
        class="h-9 px-3 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        @click="shuffle"
      >
        {{ t(m.toolAcid.randomise) }}
      </button>
      <button
        type="button"
        class="h-9 px-3 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
        @click="share"
      >
        {{ t(m.toolAcid.copyLink) }}
      </button>
    </div>

    <div class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr] items-end">
      <div class="space-y-1">
        <label for="acid-tempo" class="text-xs text-muted-foreground">
          --{{ t(m.toolAcid.tempo) }} <span class="text-foreground">{{ pattern.bpm }} bpm</span>
        </label>
        <input
          id="acid-tempo"
          v-model.number="pattern.bpm"
          type="range"
          :min="MIN_BPM"
          :max="MAX_BPM"
          class="w-full h-9 accent-[var(--neon-green)]"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs h-9" role="radiogroup" :aria-label="t(m.toolAcid.wave)">
        <span class="text-muted-foreground">--{{ t(m.toolAcid.wave) }}</span>
        <button
          v-for="wave in WAVES"
          :key="wave"
          type="button"
          role="radio"
          :aria-checked="pattern.wave === wave"
          class="px-2 py-0.5 rounded border font-mono transition-colors"
          :class="pattern.wave === wave ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
          @click="pattern.wave = wave"
        >
          {{ t(m.toolAcid[wave]) }}
        </button>
      </div>
      <label class="flex items-center gap-2 text-xs text-muted-foreground h-9">
        <span>--{{ t(m.toolAcid.root) }}</span>
        <select
          v-model.number="pattern.root"
          class="h-7 rounded border border-border bg-transparent px-2 text-xs font-mono text-foreground focus:border-primary outline-none"
        >
          <option v-for="(name, i) in NOTE_NAMES" :key="name" :value="i" class="bg-card">{{ name }}</option>
        </select>
      </label>
    </div>

    <div
      role="group"
      :aria-label="t(m.toolAcid.steps)"
      data-testid="acid-steps"
      class="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-16 gap-1.5"
    >
      <div
        v-for="(step, i) in pattern.steps"
        :key="i"
        :data-current="i === playhead ? i : undefined"
        class="flex flex-col gap-1 rounded border p-1"
        :class="i === playhead ? 'border-primary border-glow' : 'border-border'"
      >
        <button
          type="button"
          :aria-pressed="step.on"
          :aria-label="label(m.toolAcid.step, i)"
          class="h-8 rounded border font-mono text-xs transition-colors"
          :class="step.on ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
          @click="step.on = !step.on"
        >
          {{ i + 1 }}
        </button>
        <select
          :aria-label="label(m.toolAcid.pitch, i)"
          :value="offsetOf(step)"
          class="h-7 w-full appearance-none rounded border border-border bg-transparent px-0.5 text-center font-mono text-[11px] text-foreground focus:border-primary outline-none cursor-pointer"
          :class="{ 'opacity-60': !step.on }"
          @change="onPitch(step, $event)"
        >
          <option v-for="option in pitches" :key="option.offset" :value="option.offset" class="bg-card">
            {{ option.name }}
          </option>
        </select>
        <button
          type="button"
          :aria-pressed="step.accent"
          :aria-label="label(m.toolAcid.accentStep, i)"
          class="h-6 rounded border text-[10px] transition-colors"
          :class="step.accent ? 'border-warning/70 bg-warning/10 text-warning' : 'border-border text-muted-foreground hover:text-foreground'"
          @click="step.accent = !step.accent"
        >
          {{ t(m.toolAcid.accentShort) }}
        </button>
        <button
          type="button"
          :aria-pressed="step.slide"
          :aria-label="label(m.toolAcid.slideStep, i)"
          class="h-6 rounded border text-[10px] transition-colors"
          :class="step.slide ? 'border-accent/70 bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:text-foreground'"
          @click="step.slide = !step.slide"
        >
          {{ t(m.toolAcid.slideShort) }}
        </button>
      </div>
    </div>

    <div role="group" :aria-label="t(m.toolAcid.knobs)" class="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="knob in KNOBS" :key="knob" class="space-y-1">
        <label :for="`acid-${knob}`" class="text-xs text-muted-foreground">
          --{{ t(m.toolAcid[knob]) }} <span class="text-foreground">{{ readout(knob) }}</span>
        </label>
        <input
          :id="`acid-${knob}`"
          v-model.number="pattern.knobs[knob]"
          type="range"
          min="0"
          max="255"
          class="w-full h-9 accent-[var(--neon-green)]"
        />
      </div>
    </div>

    <p v-if="shared" class="text-xs text-muted-foreground space-y-1" role="status">
      <span class="block">
        {{ shared.copied ? t(m.toolAcid.linkCopied) : t(m.toolAcid.linkManual) }}
        <span class="font-mono text-primary break-all select-all">{{ shared.url }}</span>
      </span>
      <!-- The terminal is desktop only, so a phone isn't told about it. -->
      <span class="hidden md:block">
        {{ shellHint[0] }}<code class="font-mono text-foreground">acid {{ shared.code }}</code>{{ shellHint[1] }}
      </span>
    </p>

    <p class="text-xs text-muted-foreground">{{ t(m.toolAcid.note) }}</p>
  </ToolFrame>
</template>
