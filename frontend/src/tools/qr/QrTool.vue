<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/i18n'
import ToolFrame from '../ToolFrame.vue'
import { byteCapacity, ECLS, encodeQr, MAX_VERSION, QrTooLong, QUIET_ZONE, toSvg, type Ecl, type QrCode } from './qr'

const { t, m } = useLocale()

const LEVELS: Record<Ecl, string> = { L: '~7%', M: '~15%', Q: '~25%', H: '~30%' }
/** Pixels per module in the PNG: big enough to print, small enough to mail. */
const PNG_SCALE = 10

const input = ref('https://jhemery.xyz')
const ecl = ref<Ecl>('M')

const bytes = computed(() => new TextEncoder().encode(input.value).length)

const result = computed<{ qr: QrCode } | { error: string } | null>(() => {
  if (!input.value) return null
  try {
    return { qr: encodeQr(input.value, ecl.value) }
  } catch (error) {
    if (!(error instanceof QrTooLong)) throw error
    return {
      error: t(m.toolQr.tooLong)
        .replace('{bytes}', String(error.bytes))
        .replace('{ecl}', error.ecl)
        .replace('{max}', String(byteCapacity(MAX_VERSION, error.ecl))),
    }
  }
})

const qr = computed(() => (result.value && 'qr' in result.value ? result.value.qr : null))
const svg = computed(() => (qr.value ? toSvg(qr.value) : ''))

// A data: URL, not an object URL: the markup is a few kilobytes at most, so there is
// nothing to revoke when the input changes. The preview and the download link share
// it, and nothing is ever uploaded.
const svgUrl = computed(() => (svg.value ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.value)}` : ''))

const info = computed(() =>
  qr.value
    ? t(m.toolQr.info)
        .replace('{version}', String(qr.value.version))
        .replaceAll('{size}', String(qr.value.size))
        .replace('{mask}', String(qr.value.mask))
        .replace('{bytes}', String(bytes.value))
    : '',
)

/** Drawn on a canvas at download time only — the preview is the SVG. */
function downloadPng() {
  const code = qr.value
  if (!code) return
  const extent = (code.size + QUIET_ZONE * 2) * PNG_SCALE
  const canvas = document.createElement('canvas')
  canvas.width = extent
  canvas.height = extent
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, extent, extent)
  context.fillStyle = '#000000'
  code.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect((x + QUIET_ZONE) * PNG_SCALE, (y + QUIET_ZONE) * PNG_SCALE, PNG_SCALE, PNG_SCALE)
    }),
  )
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'qr.png'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
</script>

<template>
  <ToolFrame title="qr.sh">
    <template #status>
      <span v-if="result && 'error' in result" class="text-destructive">{{ result.error }}</span>
      <span v-else-if="info" class="text-primary">{{ info }}</span>
    </template>

    <div class="grid gap-6 md:grid-cols-[1fr_auto]">
      <div class="space-y-4">
        <div class="space-y-1">
          <label for="qr-input" class="text-xs text-muted-foreground">--{{ t(m.toolQr.input) }}</label>
          <textarea
            id="qr-input"
            v-model="input"
            rows="5"
            spellcheck="false"
            :placeholder="t(m.toolQr.placeholder)"
            class="w-full rounded border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none resize-y"
          ></textarea>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs" role="radiogroup" :aria-label="t(m.toolQr.level)">
          <span class="text-muted-foreground">--{{ t(m.toolQr.level) }}</span>
          <button
            v-for="level in ECLS"
            :key="level"
            type="button"
            role="radio"
            :aria-checked="ecl === level"
            class="px-2 py-0.5 rounded border font-mono transition-colors"
            :class="ecl === level ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'"
            @click="ecl = level"
          >
            {{ level }} <span class="opacity-60">{{ LEVELS[level] }}</span>
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <a
            v-if="svgUrl"
            :href="svgUrl"
            download="qr.svg"
            class="px-3 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            {{ t(m.tools.download) }} {{ t(m.toolQr.svg) }}
          </a>
          <button
            type="button"
            :disabled="!qr"
            class="px-3 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
            @click="downloadPng"
          >
            {{ t(m.tools.download) }} {{ t(m.toolQr.png) }}
          </button>
        </div>

        <p class="text-xs text-muted-foreground">{{ t(m.toolQr.note) }}</p>
      </div>

      <div class="flex items-start justify-center">
        <img
          v-if="svgUrl"
          :src="svgUrl"
          alt=""
          data-testid="qr-preview"
          class="w-56 h-56 md:w-64 md:h-64 rounded bg-white [image-rendering:pixelated]"
        />
        <p v-else class="w-56 text-sm text-muted-foreground">{{ t(m.toolQr.empty) }}</p>
      </div>
    </div>
  </ToolFrame>
</template>
