<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import ToolFrame from '../ToolFrame.vue'
import { FLAGS, segments, type Flag, type RegexResult } from './regex'

const { t, m } = useLocale()

/** A second is long for a regex and short for a person: anything slower is backtracking. */
const TIMEOUT_MS = 1000
/** Typing pauses this long before a run, so each keystroke does not spawn a worker. */
const DEBOUNCE_MS = 150

const pattern = ref('(?<word>\\w+)@(\\w+)\\.xyz')
const flags = ref<Set<Flag>>(new Set(['g']))
const text = ref('contact@jhemery.xyz, couvbat@jhemery.xyz and nobody@example.com')

const result = ref<RegexResult | null>(null)
const timedOut = ref(false)
const running = ref(false)

let worker: Worker | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let debounce: ReturnType<typeof setTimeout> | undefined

function stop() {
  clearTimeout(timer)
  worker?.terminate()
  worker = null
  running.value = false
}

/**
 * A fresh worker per run, terminated as soon as it answers or at `TIMEOUT_MS`. Reusing
 * one would save a few milliseconds and cost the only guarantee that matters: a
 * worker stuck in `exec` cannot be interrupted, only killed.
 */
function run() {
  stop()
  if (!pattern.value) {
    result.value = null
    timedOut.value = false
    return
  }
  running.value = true
  worker = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RegexResult>) => {
    result.value = event.data
    timedOut.value = false
    stop()
  }
  timer = setTimeout(() => {
    stop()
    result.value = null
    timedOut.value = true
  }, TIMEOUT_MS)
  worker.postMessage({ pattern: pattern.value, flags: [...flags.value].join(''), text: text.value })
}

watch(
  [pattern, flags, text],
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(run, DEBOUNCE_MS)
  },
  { immediate: true, deep: true },
)
onUnmounted(() => {
  clearTimeout(debounce)
  stop()
})

function toggle(flag: Flag) {
  const next = new Set(flags.value)
  if (next.has(flag)) next.delete(flag)
  else next.add(flag)
  flags.value = next
}

const matches = computed(() => (result.value?.ok ? result.value.matches : []))
const runs = computed(() => segments(text.value, matches.value))

const status = computed(() => {
  if (timedOut.value) return { ok: false, text: t(m.toolRegex.timeout) }
  const r = result.value
  if (!r) return null
  if (!r.ok) return { ok: false, text: r.error }
  const count = r.matches.length
  const label = count === 0 ? t(m.toolRegex.none) : count === 1 ? t(m.toolRegex.one) : t(m.toolRegex.matches).replace('{n}', String(count))
  return { ok: true, text: r.truncated ? `${label} · ${t(m.toolRegex.truncated).replace('{n}', String(count))}` : label }
})

/** Alternating tints, so two adjacent matches read as two. */
const tint = (i: number) => (i % 2 === 0 ? 'bg-primary/25 text-foreground' : 'bg-accent/25 text-foreground')
</script>

<template>
  <ToolFrame title="regex.sh">
    <template #status>
      <span v-if="running" class="text-muted-foreground">{{ t(m.tools.working) }}</span>
      <span v-else-if="status" :class="status.ok ? 'text-primary' : 'text-destructive'">{{ status.text }}</span>
    </template>

    <div class="space-y-1">
      <label for="regex-pattern" class="text-xs text-muted-foreground">--{{ t(m.toolRegex.pattern) }}</label>
      <div
        class="flex items-center rounded border bg-transparent font-mono text-sm focus-within:border-primary"
        :class="status && !status.ok ? 'border-destructive' : 'border-border'"
      >
        <span class="pl-3 text-muted-foreground">/</span>
        <input
          id="regex-pattern"
          v-model="pattern"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="status && !status.ok ? 'true' : undefined"
          class="flex-1 min-w-0 bg-transparent px-1 py-2 text-foreground outline-none"
        />
        <span class="pr-3 text-muted-foreground">/{{ [...flags].join('') }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-xs" role="group" :aria-label="t(m.toolRegex.flags)">
      <span class="text-muted-foreground">--{{ t(m.toolRegex.flags) }}</span>
      <button
        v-for="flag in FLAGS"
        :key="flag"
        type="button"
        :aria-pressed="flags.has(flag)"
        :title="t(m.toolRegex[flag])"
        class="px-2 py-0.5 rounded border font-mono transition-colors"
        :class="flags.has(flag) ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="toggle(flag)"
      >
        {{ flag }}
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-1">
        <label for="regex-text" class="text-xs text-muted-foreground">{{ t(m.toolRegex.text) }}</label>
        <textarea
          id="regex-text"
          v-model="text"
          rows="10"
          spellcheck="false"
          :placeholder="t(m.toolRegex.placeholder)"
          class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
        ></textarea>
      </div>
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">{{ t(m.tools.output) }}</span>
        <pre
          data-testid="regex-highlight"
          class="min-h-[14rem] rounded border border-border bg-black/30 light:bg-muted px-3 py-2 font-mono text-sm whitespace-pre-wrap break-words"
        ><template v-for="(run, i) in runs" :key="i"><mark v-if="run.match !== null" :class="['rounded-sm', tint(run.match)]">{{ run.text }}</mark><span v-else class="text-muted-foreground">{{ run.text }}</span></template></pre>
      </div>
    </div>

    <ol v-if="matches.length" class="space-y-1 font-mono text-xs max-h-64 overflow-y-auto">
      <li v-for="(match, i) in matches.slice(0, 100)" :key="i" class="flex flex-wrap gap-x-3">
        <span class="text-muted-foreground w-10">#{{ i + 1 }}</span>
        <span :class="['px-1 rounded-sm', tint(i)]">{{ match.text || '∅' }}</span>
        <span class="text-muted-foreground">@{{ match.start }}</span>
        <span v-for="group in match.groups" :key="group.index" class="text-muted-foreground">
          {{ group.name ?? `${t(m.toolRegex.group)} ${group.index}` }}:
          <span v-if="group.text !== undefined" class="text-accent">{{ group.text }}</span>
          <span v-else class="italic">{{ t(m.toolRegex.unmatched) }}</span>
        </span>
      </li>
    </ol>

    <p class="text-xs text-muted-foreground">{{ t(m.toolRegex.flavour) }}</p>
  </ToolFrame>
</template>
