<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '@/i18n'
import ToolFrame from '../ToolFrame.vue'
import {
  FORMATS,
  MIME,
  canEncode,
  fitWidth,
  formatBytes,
  isLossy,
  outputName,
  savings,
  type ImageFormat,
} from './image'

const { t, m } = useLocale()

interface Source {
  file: File
  bitmap: ImageBitmap
  url: string
}
interface Result {
  blob: Blob
  url: string
  name: string
  width: number
  height: number
}

const source = ref<Source | null>(null)
const result = ref<Result | null>(null)
const format = ref<ImageFormat>('webp')
const quality = ref(82)
const maxWidth = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const dragging = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

/** Which formats this browser can write — probed once, on a 1×1 canvas. */
const encodable = ref<Record<ImageFormat, boolean>>({ png: true, jpeg: true, webp: true })
onMounted(() => {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 1
  encodable.value = {
    png: true,
    jpeg: canEncode('jpeg', probe),
    webp: canEncode('webp', probe),
  }
})
const unsupported = computed(() => !encodable.value[format.value])

function revoke(item: { url: string } | null) {
  if (item) URL.revokeObjectURL(item.url)
}

async function onFile(file: File | undefined) {
  if (!file) return
  error.value = null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    error.value = t(m.toolImage.notImage)
    return
  }
  revoke(source.value)
  source.value?.bitmap.close()
  source.value = { file, bitmap, url: URL.createObjectURL(file) }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void onFile(event.dataTransfer?.files[0])
}

function onPick(event: Event) {
  void onFile((event.target as HTMLInputElement).files?.[0])
}

/** Re-encodes the source with the current settings. Runs on every change, debounced
 *  a little so dragging the quality slider does not encode sixty times a second. */
let pending: ReturnType<typeof setTimeout> | undefined
function scheduleConvert() {
  clearTimeout(pending)
  pending = setTimeout(() => void convert(), 120)
}

async function convert() {
  const current = source.value
  if (!current) return
  busy.value = true
  try {
    const limit = Number.parseInt(maxWidth.value, 10)
    const size = fitWidth(current.bitmap.width, current.bitmap.height, Number.isNaN(limit) ? null : limit)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    // JPEG has no alpha: without this, transparent pixels come out black.
    if (format.value === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.drawImage(current.bitmap, 0, 0, size.width, size.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, MIME[format.value], isLossy(format.value) ? quality.value / 100 : undefined),
    )
    if (!blob) throw new Error('encode')

    revoke(result.value)
    // The name follows what the browser actually produced, not what was asked for.
    const produced = (FORMATS.find((f) => MIME[f] === blob.type) ?? format.value) as ImageFormat
    result.value = {
      blob,
      url: URL.createObjectURL(blob),
      name: outputName(current.file.name, produced),
      width: size.width,
      height: size.height,
    }
  } catch {
    error.value = t(m.toolImage.notImage)
  } finally {
    busy.value = false
  }
}

watch(source, () => void convert())
watch([format, quality, maxWidth], scheduleConvert)

const saved = computed(() =>
  source.value && result.value ? savings(source.value.file.size, result.value.blob.size) : 0,
)

onUnmounted(() => {
  clearTimeout(pending)
  revoke(source.value)
  revoke(result.value)
  source.value?.bitmap.close()
})
</script>

<template>
  <ToolFrame title="image.sh">
    <template #status>
      <span v-if="busy">{{ t(m.tools.working) }}</span>
    </template>

    <label
      class="flex flex-col items-center justify-center gap-1 rounded border border-dashed px-4 py-8 text-center cursor-pointer transition-colors"
      :class="dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="text-muted-foreground">
        {{ t(m.tools.dropFile) }} <span class="text-primary underline">{{ t(m.tools.browse) }}</span>
      </span>
      <span v-if="source" class="text-xs text-foreground">
        {{ source.file.name }} · {{ source.bitmap.width }}×{{ source.bitmap.height }} ·
        {{ formatBytes(source.file.size) }}
      </span>
      <input ref="inputEl" type="file" accept="image/*" class="sr-only" @change="onPick" />
    </label>

    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="space-y-1">
        <label for="image-format" class="text-xs text-muted-foreground">--{{ t(m.toolImage.format) }}</label>
        <select
          id="image-format"
          v-model="format"
          class="w-full h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none"
        >
          <option v-for="f in FORMATS" :key="f" :value="f" class="bg-card">{{ f }}</option>
        </select>
      </div>
      <div class="space-y-1">
        <label for="image-quality" class="text-xs text-muted-foreground">
          --{{ t(m.toolImage.quality) }} <span class="text-foreground">{{ quality }}</span>
        </label>
        <input
          id="image-quality"
          v-model.number="quality"
          type="range"
          min="1"
          max="100"
          :disabled="!isLossy(format)"
          class="w-full h-9 accent-[var(--neon-green)] disabled:opacity-40"
        />
      </div>
      <div class="space-y-1">
        <label for="image-width" class="text-xs text-muted-foreground">--{{ t(m.toolImage.maxWidth) }}</label>
        <input
          id="image-width"
          v-model="maxWidth"
          type="number"
          min="1"
          inputmode="numeric"
          placeholder="∞"
          class="w-full h-9 rounded border border-border bg-transparent px-2 text-sm text-foreground focus:border-primary outline-none"
        />
      </div>
    </div>

    <p v-if="unsupported" class="text-xs text-warning text-yellow-400">{{ t(m.toolImage.unsupported) }}</p>

    <div v-if="source && result" class="grid gap-4 sm:grid-cols-2">
      <figure class="space-y-1">
        <img :src="source.url" alt="" class="max-h-56 w-full object-contain rounded border border-border bg-black/40" />
        <figcaption class="text-xs text-muted-foreground">
          {{ t(m.toolImage.original) }} · {{ formatBytes(source.file.size) }}
        </figcaption>
      </figure>
      <figure class="space-y-1">
        <img :src="result.url" alt="" class="max-h-56 w-full object-contain rounded border border-primary/40 bg-black/40" />
        <figcaption class="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
          <span>
            {{ t(m.toolImage.result) }} · {{ result.width }}×{{ result.height }} ·
            {{ formatBytes(result.blob.size) }}
          </span>
          <span :class="saved >= 0 ? 'text-primary' : 'text-destructive'">{{ saved >= 0 ? '−' : '+' }}{{ Math.abs(saved) }}%</span>
          <a
            :href="result.url"
            :download="result.name"
            class="ml-auto px-2 py-0.5 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
          >
            {{ t(m.tools.download) }} {{ result.name }}
          </a>
        </figcaption>
      </figure>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolImage.privacy) }}</p>
  </ToolFrame>
</template>
