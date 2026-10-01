<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Localised } from '@/content/types'
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
import { groupFields, inspectFile, type MetaField, type MetaReport, type Unreadable } from './metadata'

const { t, m } = useLocale()

interface Source {
  file: File
  bitmap: ImageBitmap
  url: string
  report: MetaReport
}
interface Result {
  blob: Blob
  url: string
  name: string
  width: number
  height: number
  /** The output read back with the same inspector, so the verdict and the file it speaks
   *  for always come from the same conversion. */
  report: MetaReport
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

// Every pick and every conversion takes a ticket, and one that finishes after a newer one
// started is dropped: reading a 60 MB file takes long enough for the visitor to pick another.
let picked = 0
let converted = 0

/** Decodes with the file's own Orientation applied, so stripping the tag can't leave a phone
 *  photo on its side. Asked for explicitly because engines have disagreed on what the default
 *  does with it; one that predates `from-image` refuses the option with a TypeError, and gets
 *  its default rather than "not an image". */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (failure) {
    if (failure instanceof TypeError) return createImageBitmap(file)
    throw failure
  }
}

async function onFile(file: File | undefined) {
  if (!file) return
  const ticket = ++picked
  error.value = null
  const decoded = await Promise.all([decode(file), inspectFile(file)]).catch(() => null)
  if (ticket !== picked) {
    decoded?.[0].close()
    return
  }
  if (!decoded) {
    error.value = t(m.toolImage.notImage)
    return
  }
  const [bitmap, report] = decoded
  revoke(source.value)
  source.value?.bitmap.close()
  source.value = { file, bitmap, url: URL.createObjectURL(file), report }
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
  const ticket = ++converted
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
    const report = await inspectFile(blob)
    if (ticket !== converted) return

    revoke(result.value)
    // The name follows what the browser actually produced, not what was asked for.
    const produced = (FORMATS.find((f) => MIME[f] === blob.type) ?? format.value) as ImageFormat
    result.value = {
      blob,
      url: URL.createObjectURL(blob),
      name: outputName(current.file.name, produced),
      width: size.width,
      height: size.height,
      report,
    }
  } catch {
    if (ticket === converted) error.value = t(m.toolImage.notImage)
  } finally {
    if (ticket === converted) busy.value = false
  }
}

watch(source, () => void convert())
watch([format, quality, maxWidth], scheduleConvert)

const saved = computed(() =>
  source.value && result.value ? savings(source.value.file.size, result.value.blob.size) : 0,
)

// --- What the file gives away -------------------------------------------------------------
// Every value below comes from the file. The inspector has already stripped and capped it,
// and it reaches the page only through text interpolation: no v-html, no attribute.

const NAMES: Record<Unreadable, string> = { heic: 'HEIC', avif: 'AVIF', gif: 'GIF' }

function plural(count: number, one: Localised, many: Localised): string {
  return count === 1 ? t(one) : t(many).replace('{n}', String(count))
}

const report = computed(() => source.value?.report ?? null)
const inspected = computed(() => (report.value && report.value.format !== 'unsupported' ? report.value : null))
const sections = computed(() => (inspected.value ? groupFields(inspected.value.fields) : []))
const unreadable = computed(() => {
  if (report.value?.format !== 'unsupported') return null
  const detected = report.value.detected
  return detected ? t(m.toolImage.unreadable).replace('{format}', NAMES[detected]) : t(m.toolImage.unreadableUnknown)
})

function label(field: MetaField): string {
  return t(m.toolImageFields[field.key])
}

function display(field: MetaField): string {
  if (field.key === 'orientation') {
    // The inspector names an orientation only when it is 1–8, so this always lands.
    const turn = m.toolImageOrientation[Number(field.value) as keyof typeof m.toolImageOrientation]
    return turn ? `${field.value} — ${t(turn)}` : field.value
  }
  if (field.value) return field.value
  return field.bytes === undefined ? t(m.toolImage.present) : formatBytes(field.bytes)
}

/** The tool's own output, read back: the one line the privacy note stands on. */
const verdict = computed(() => {
  const output = result.value?.report
  if (!output) return null
  if (output.format === 'unsupported') return { ok: false, text: t(m.toolImage.unverified) }
  if (output.count === 0 && output.truncated) return { ok: false, text: t(m.toolImage.verifiedHead) }
  if (output.count === 0) return { ok: true, text: t(m.toolImage.verified) }
  const survivors = [...new Set(output.fields.map(label))].join(', ')
  const text = plural(output.count, m.toolImage.survivedOne, m.toolImage.survivedMany)
  if (!survivors) return { ok: false, text }
  return { ok: false, text: t(m.toolImage.survivors).replace('{verdict}', text).replace('{list}', survivors) }
})

onUnmounted(() => {
  clearTimeout(pending)
  // Anything still in flight finds its ticket stale and drops what it made.
  picked++
  converted++
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

    <section
      v-if="report"
      class="space-y-2 rounded border border-border p-3"
      :aria-label="t(m.toolImage.givesAway)"
      data-testid="image-metadata"
    >
      <p class="text-xs text-muted-foreground">
        {{ t(m.toolImage.givesAway) }}
        <template v-if="inspected">
          ·
          <span :class="inspected.count ? 'text-warning' : 'text-primary'">
            {{ plural(inspected.count, m.toolImage.fieldsOne, m.toolImage.fieldsMany) }}
          </span>
        </template>
      </p>
      <p v-if="unreadable" class="text-xs text-warning">{{ unreadable }}</p>
      <template v-if="inspected">
        <p v-if="inspected.count === 0" class="text-xs text-primary">{{ t(m.toolImage.nothing) }}</p>
        <div v-for="section in sections" :key="section.group" class="space-y-0.5">
          <p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {{ t(m.toolImageGroups[section.group]) }}
          </p>
          <dl class="grid gap-x-4 gap-y-0.5 text-xs font-mono sm:grid-cols-[minmax(0,12rem)_1fr]">
            <template v-for="(field, index) in section.fields" :key="index">
              <dt class="text-muted-foreground break-words">
                {{ label(field) }}<template v-if="field.name"> · {{ field.name }}</template>
              </dt>
              <dd class="text-foreground break-all">
                {{ display(field) }}
                <span v-if="field.key === 'gps'" class="text-warning">— {{ t(m.toolImage.whereYouStood) }}</span>
              </dd>
            </template>
          </dl>
        </div>
        <p v-if="inspected.more" class="text-xs text-muted-foreground">
          {{ plural(inspected.more, m.toolImage.moreOne, m.toolImage.moreMany) }}
        </p>
        <p v-if="inspected.truncated" class="text-xs text-warning">{{ t(m.toolImage.truncated) }}</p>
      </template>
    </section>

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

    <p v-if="unsupported" class="text-xs text-warning">{{ t(m.toolImage.unsupported) }}</p>

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
        <p
          v-if="verdict"
          class="text-xs"
          :class="verdict.ok ? 'text-primary' : 'text-warning'"
          data-testid="image-verdict"
        >
          {{ verdict.text }}
        </p>
      </figure>
    </div>

    <p class="text-xs text-muted-foreground">{{ t(m.toolImage.privacy) }}</p>
  </ToolFrame>
</template>
