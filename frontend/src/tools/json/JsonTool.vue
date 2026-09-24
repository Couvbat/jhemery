<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import { formatBytes } from '../image/image'
import { formatJson, jsonStats, minifyJson, type Indent, type JsonResult } from './json'

const { t, m } = useLocale()

const input = ref('')
const indent = ref<Indent>(2)
const mode = ref<'format' | 'minify'>('format')

const result = computed<JsonResult | null>(() => {
  if (!input.value.trim()) return null
  return mode.value === 'format' ? formatJson(input.value, indent.value) : minifyJson(input.value)
})

const output = computed(() => (result.value?.ok ? result.value.output : ''))

const status = computed(() => {
  const r = result.value
  if (!r) return null
  if (r.ok) {
    const stats = jsonStats(r.output)
    return {
      ok: true,
      text: `${t(m.toolJson.valid)} · ${t(m.toolJson.stats)
        .replace('{bytes}', formatBytes(stats.bytes))
        .replace('{lines}', String(stats.lines))}`,
    }
  }
  if (r.line === undefined || r.column === undefined) {
    return { ok: false, text: t(m.toolJson.invalidNoPosition).replace('{message}', r.message) }
  }
  return {
    ok: false,
    text: t(m.toolJson.invalid)
      .replace('{line}', String(r.line))
      .replace('{column}', String(r.column))
      .replace('{message}', r.message),
  }
})

/** The offending line with a caret under the column — what a compiler would print. */
const pointer = computed(() => {
  const r = result.value
  if (!r || r.ok || r.line === undefined || r.column === undefined) return null
  const line = input.value.split('\n')[r.line - 1] ?? ''
  return { line, caret: `${' '.repeat(Math.max(0, r.column - 1))}^` }
})
</script>

<template>
  <ToolFrame title="json.sh">
    <template #status>
      <span v-if="status" :class="status.ok ? 'text-primary' : 'text-destructive'">{{ status.text }}</span>
    </template>

    <div class="flex flex-wrap items-center gap-2 text-xs" role="tablist">
      <button
        v-for="option in ['format', 'minify'] as const"
        :key="option"
        type="button"
        role="tab"
        :aria-selected="mode === option"
        class="px-3 py-1 rounded border transition-colors"
        :class="mode === option ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="mode = option"
      >
        --{{ t(m.toolJson[option]) }}
      </button>
      <template v-if="mode === 'format'">
        <span class="mx-2 text-border">|</span>
        <label for="json-indent" class="text-muted-foreground">--{{ t(m.toolJson.indent) }}</label>
        <select
          id="json-indent"
          v-model="indent"
          class="h-7 rounded border border-border bg-transparent px-2 text-xs text-foreground focus:border-primary outline-none"
        >
          <option :value="2" class="bg-card">2</option>
          <option :value="4" class="bg-card">4</option>
          <option value="&#9;" class="bg-card">tab</option>
        </select>
      </template>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <label for="json-input">{{ t(m.tools.input) }}</label>
        </div>
        <textarea
          id="json-input"
          v-model="input"
          rows="12"
          spellcheck="false"
          :placeholder="t(m.toolJson.placeholder)"
          :aria-invalid="status && !status.ok ? 'true' : undefined"
          class="w-full rounded border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
          :class="status && !status.ok ? 'border-destructive' : 'border-border'"
        ></textarea>
        <pre v-if="pointer" class="text-xs text-destructive overflow-x-auto"><span class="text-muted-foreground">{{ pointer.line }}</span>
{{ pointer.caret }}</pre>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <label for="json-output">{{ t(m.tools.output) }}</label>
          <CopyButton :text="output" />
        </div>
        <textarea
          id="json-output"
          :value="output"
          readonly
          rows="12"
          spellcheck="false"
          class="w-full rounded border border-border bg-black/30 light:bg-muted px-3 py-2 font-mono text-sm text-primary outline-none resize-y"
        ></textarea>
      </div>
    </div>
  </ToolFrame>
</template>
