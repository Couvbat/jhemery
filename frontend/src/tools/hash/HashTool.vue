<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { formatBytes } from '../image/image'
import { ALGORITHMS, digest, toBase64, toHex, type Algorithm } from './hash'

const { t, m } = useLocale()

type Mode = 'text' | 'file'
const mode = ref<Mode>('text')
const text = ref('')
const file = ref<File | null>(null)
const encoding = ref<'hex' | 'base64'>('hex')
const busy = ref(false)
const results = ref<Partial<Record<Algorithm, ArrayBuffer>>>({})

/** Guards against a slow file digest landing after a faster text one. */
let generation = 0

async function compute() {
  const mine = ++generation
  const data =
    mode.value === 'text'
      ? new TextEncoder().encode(text.value)
      : file.value
        ? new Uint8Array(await file.value.arrayBuffer())
        : null
  if (!data || (mode.value === 'text' && !text.value)) {
    results.value = {}
    return
  }
  busy.value = true
  try {
    const digests = await Promise.all(ALGORITHMS.map((algorithm) => digest(algorithm, data)))
    if (mine !== generation) return
    results.value = Object.fromEntries(ALGORITHMS.map((algorithm, i) => [algorithm, digests[i]!]))
  } finally {
    if (mine === generation) busy.value = false
  }
}

let pending: ReturnType<typeof setTimeout> | undefined
watch(text, () => {
  clearTimeout(pending)
  pending = setTimeout(() => void compute(), 150)
})
watch([mode, file], () => void compute())

function onPick(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

function onDrop(event: DragEvent) {
  const dropped = event.dataTransfer?.files[0]
  if (!dropped) return
  mode.value = 'file'
  file.value = dropped
}

function render(buffer: ArrayBuffer | undefined): string {
  if (!buffer) return ''
  return encoding.value === 'hex' ? toHex(buffer) : toBase64(buffer)
}

onUnmounted(() => clearTimeout(pending))
</script>

<template>
  <ToolFrame title="hash.sh">
    <template #status>
      <span v-if="busy">{{ t(m.tools.working) }}</span>
    </template>

    <div class="flex flex-wrap items-center gap-2 text-xs" role="tablist">
      <button
        v-for="option in ['text', 'file'] as const"
        :key="option"
        type="button"
        role="tab"
        :aria-selected="mode === option"
        class="px-3 py-1 rounded border transition-colors"
        :class="mode === option ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="mode = option"
      >
        --{{ t(m.toolHash[option]) }}
      </button>
      <span class="mx-2 text-border">|</span>
      <button
        v-for="option in ['hex', 'base64'] as const"
        :key="option"
        type="button"
        class="px-3 py-1 rounded border transition-colors"
        :class="encoding === option ? 'border-accent text-accent' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="encoding = option"
      >
        {{ t(m.toolHash[option]) }}
      </button>
    </div>

    <textarea
      v-if="mode === 'text'"
      v-model="text"
      rows="4"
      spellcheck="false"
      :placeholder="t(m.toolHash.placeholder)"
      :aria-label="t(m.toolHash.text)"
      class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
    ></textarea>

    <label
      v-else
      class="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border px-4 py-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span class="text-muted-foreground">
        {{ t(m.tools.dropFile) }} <span class="text-primary underline">{{ t(m.tools.browse) }}</span>
      </span>
      <span v-if="file" class="text-xs text-foreground">{{ file.name }} · {{ formatBytes(file.size) }}</span>
      <input type="file" class="sr-only" @change="onPick" />
    </label>

    <dl class="space-y-3">
      <div v-for="algorithm in ALGORITHMS" :key="algorithm" class="space-y-1">
        <dt class="flex items-center justify-between text-xs text-muted-foreground">
          <span>{{ algorithm }}</span>
          <CopyButton :text="render(results[algorithm])" />
        </dt>
        <dd
          class="font-mono text-xs break-all rounded border border-border/60 bg-black/30 light:bg-muted px-3 py-2 min-h-8"
          :class="results[algorithm] ? 'text-primary' : 'text-muted-foreground/50'"
        >
          {{ render(results[algorithm]) || '—' }}
        </dd>
      </div>
    </dl>
  </ToolFrame>
</template>
