<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'
import CopyButton from '../CopyButton.vue'
import ToolFrame from '../ToolFrame.vue'
import {
  contrastRatio,
  parseColour,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcagLevel,
  type WcagLevel,
} from './colour'

const { t, m } = useLocale()
const { theme } = useTheme()

const input = ref('#00ff41')
const against = ref('#0d0f0d')

const colour = computed(() => parseColour(input.value))
const other = computed(() => parseColour(against.value))
const invalid = computed(() => input.value.trim() !== '' && !colour.value)

/** The stylesheet's own tokens, read live so the presets can never drift from the
 *  theme — on mount, and again whenever `theme` writes new ones over them. The
 *  default's are `oklch()` strings and the other schemes' hex; the parser takes both. */
interface Preset {
  name: string
  value: string
}
const presets = ref<Preset[]>([])
/** The background last copied into `against`, so a scheme switch can tell whether the
 *  field still holds the page's colour or something the visitor typed. */
let pageBackground: string | null = null

function readPresets() {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => style.getPropertyValue(name).trim()
  presets.value = (
    [
      ['--neon-green', 'neon-green'],
      ['--neon-cyan', 'neon-cyan'],
      ['--neon-purple', 'neon-purple'],
      ['--neon-pink', 'neon-pink'],
      ['--background', 'background'],
      ['--card', 'card'],
      ['--foreground', 'foreground'],
      ['--muted-foreground', 'muted-foreground'],
    ] as const
  )
    .map(([variable, name]) => ({ name, value: read(variable) }))
    .filter((p) => parseColour(p.value))
  const background = read('--background')
  if (!parseColour(background)) return
  if (pageBackground === null || against.value === pageBackground) against.value = background
  pageBackground = background
}

onMounted(readPresets)
watch(theme, readPresets)

const formats = computed(() =>
  colour.value
    ? [
        { label: 'hex', value: toHex(colour.value) },
        { label: 'rgb', value: toRgbString(colour.value) },
        { label: 'hsl', value: toHslString(colour.value) },
        { label: 'oklch', value: toOklchString(colour.value) },
      ]
    : [],
)

const contrast = computed(() =>
  colour.value && other.value ? contrastRatio(colour.value, other.value) : null,
)

const table = computed(() =>
  colour.value
    ? presets.value.map((preset) => {
        const rgb = parseColour(preset.value)!
        const ratio = contrastRatio(colour.value!, rgb)
        return { ...preset, hex: toHex(rgb), ratio, level: wcagLevel(ratio) }
      })
    : [],
)

const LEVEL_CLASS: Record<WcagLevel, string> = {
  AAA: 'text-primary',
  AA: 'text-primary',
  'AA large': 'text-warning',
  fail: 'text-destructive',
}

function swatch(value: string): string {
  const rgb = parseColour(value)
  return rgb ? toRgbString(rgb) : 'transparent'
}
</script>

<template>
  <ToolFrame title="colour.sh">
    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-1">
        <label for="colour-input" class="text-xs text-muted-foreground">--{{ t(m.toolColour.input) }}</label>
        <div class="flex items-center gap-2">
          <span
            class="w-9 h-9 shrink-0 rounded border border-border"
            :style="{ background: swatch(input) }"
            aria-hidden="true"
          ></span>
          <input
            id="colour-input"
            v-model="input"
            type="text"
            spellcheck="false"
            :placeholder="t(m.toolColour.placeholder)"
            :aria-invalid="invalid ? 'true' : undefined"
            class="w-full h-9 rounded border bg-transparent px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none"
            :class="invalid ? 'border-destructive' : 'border-border'"
          />
        </div>
        <p v-if="invalid" class="text-xs text-destructive">{{ t(m.toolColour.invalid) }}</p>
      </div>
      <div class="space-y-1">
        <label for="colour-against" class="text-xs text-muted-foreground">--{{ t(m.toolColour.against) }}</label>
        <div class="flex items-center gap-2">
          <span
            class="w-9 h-9 shrink-0 rounded border border-border"
            :style="{ background: swatch(against) }"
            aria-hidden="true"
          ></span>
          <input
            id="colour-against"
            v-model="against"
            type="text"
            spellcheck="false"
            class="w-full h-9 rounded border border-border bg-transparent px-3 font-mono text-sm text-foreground focus:border-primary outline-none"
          />
        </div>
        <p v-if="contrast !== null" class="text-xs text-muted-foreground">
          {{ t(m.toolColour.contrast) }}
          <span class="text-foreground">{{ contrast.toFixed(2) }}:1</span>
          <span class="ml-2 font-semibold" :class="LEVEL_CLASS[wcagLevel(contrast)]">{{ wcagLevel(contrast) }}</span>
        </p>
      </div>
    </div>

    <dl v-if="formats.length" class="grid gap-2 sm:grid-cols-2">
      <div
        v-for="format in formats"
        :key="format.label"
        class="flex items-center gap-2 rounded border border-border/60 bg-black/30 light:bg-muted px-3 py-2"
      >
        <dt class="w-12 text-xs text-muted-foreground">{{ format.label }}</dt>
        <dd class="flex-1 font-mono text-sm text-primary break-all">{{ format.value }}</dd>
        <CopyButton :text="format.value" />
      </div>
    </dl>

    <div v-if="table.length" class="space-y-2">
      <p class="text-xs text-muted-foreground">{{ t(m.toolColour.presets) }}</p>
      <ul class="grid gap-1 sm:grid-cols-2">
        <li
          v-for="row in table"
          :key="row.name"
          class="flex items-center gap-2 text-xs rounded px-2 py-1"
          :style="{ background: row.hex }"
        >
          <span
            class="px-1.5 py-0.5 rounded font-mono"
            :style="{ background: formats[0]?.value, color: row.hex }"
            >Aa</span
          >
          <span class="text-foreground mix-blend-difference">{{ row.name }}</span>
          <span class="ml-auto font-mono text-foreground mix-blend-difference">{{ row.ratio.toFixed(2) }}:1</span>
          <span class="w-16 text-right font-semibold rounded bg-background/80 px-1" :class="LEVEL_CLASS[row.level]">{{ row.level }}</span>
        </li>
      </ul>
    </div>
  </ToolFrame>
</template>
