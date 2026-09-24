<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { CASE_MODES, textStats, transformCase, wordFrequency, type CaseMode } from './text'

const { t, m } = useLocale()

const input = ref('')
const mode = ref<CaseMode>('title')

const stats = computed(() => textStats(input.value))
const output = computed(() => (input.value ? transformCase(input.value, mode.value) : ''))
const frequency = computed(() => wordFrequency(input.value, 8))

function duration(seconds: number): string {
  if (seconds < 60) return t(m.toolText.seconds).replace('{n}', String(seconds))
  return t(m.toolText.minutes).replace('{n}', String(Math.round(seconds / 60)))
}

const cells = computed(() => [
  { label: t(m.toolText.words), value: String(stats.value.words) },
  { label: t(m.toolText.characters), value: String(stats.value.characters) },
  { label: t(m.toolText.noSpaces), value: String(stats.value.charactersNoSpaces) },
  { label: t(m.toolText.lines), value: String(stats.value.lines) },
  { label: t(m.toolText.sentences), value: String(stats.value.sentences) },
  { label: t(m.toolText.paragraphs), value: String(stats.value.paragraphs) },
  { label: t(m.toolText.bytes), value: String(stats.value.bytes) },
  { label: t(m.toolText.reading), value: duration(stats.value.readingSeconds) },
  { label: t(m.toolText.speaking), value: duration(stats.value.speakingSeconds) },
])
</script>

<template>
  <ToolFrame title="text.sh">
    <textarea
      v-model="input"
      rows="8"
      spellcheck="false"
      :placeholder="t(m.toolText.placeholder)"
      :aria-label="t(m.tools.input)"
      class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
    ></textarea>

    <dl class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      <div v-for="cell in cells" :key="cell.label" class="rounded border border-border/60 bg-black/30 light:bg-muted px-2 py-1.5">
        <dt class="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{{ cell.label }}</dt>
        <dd class="font-mono text-sm text-primary">{{ cell.value }}</dd>
      </div>
    </dl>

    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2 text-xs" role="tablist">
        <span class="text-muted-foreground">--{{ t(m.toolText.cases) }}</span>
        <button
          v-for="option in CASE_MODES"
          :key="option"
          type="button"
          role="tab"
          :aria-selected="mode === option"
          class="px-2 py-1 rounded border font-mono transition-colors"
          :class="mode === option ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
          @click="mode = option"
        >
          {{ option }}
        </button>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <label for="text-output">{{ t(m.tools.output) }}</label>
          <CopyButton :text="output" />
        </div>
        <textarea
          id="text-output"
          :value="output"
          readonly
          rows="5"
          spellcheck="false"
          class="w-full rounded border border-border bg-black/30 light:bg-muted px-3 py-2 font-mono text-sm text-primary outline-none resize-y"
        ></textarea>
      </div>
    </div>

    <div v-if="frequency.length" class="space-y-1">
      <p class="text-xs text-muted-foreground">{{ t(m.toolText.frequency) }}</p>
      <ul class="flex flex-wrap gap-1.5 text-xs">
        <li
          v-for="entry in frequency"
          :key="entry.word"
          class="rounded border border-border/60 px-2 py-0.5 font-mono"
        >
          <span class="text-foreground">{{ entry.word }}</span>
          <span class="ml-1 text-accent">{{ entry.count }}</span>
        </li>
      </ul>
    </div>
  </ToolFrame>
</template>
