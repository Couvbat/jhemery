<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { privacyCopy } from '@/content/privacy'
import type { Localised } from '@/content/types'
import CodeText from '@/components/CodeText.vue'
import { useStoredItems } from '@/composables/useStoredItems'
import { useLocale } from '@/i18n'
import {
  PORTABLE_GROUPS,
  decodeSave,
  encodeSave,
  portableItems,
  saveLink,
  writeSave,
  type PortableGroup,
  type SavedItem,
} from '@/lib/save-file'
import { SAVE_MARKER, pendingSave } from '@/lib/save-link'
import { STORAGE_GROUPS, entryFor, reloadPage } from '@/lib/storage-keys'
import { formatBytes } from '@/tools/image/image'

/**
 * The save file's two halves on `/privacy` (`lib/save-file.ts`): make a link of what this
 * browser keeps, and restore one here. Its own component so the page that lists and clears
 * stays readable; it reads the same live list.
 */

const { t, m } = useLocale()
const live = useStoredItems()

/**
 * Past this version a symbol drawn at this size has modules too small for a phone camera
 * to read reliably off a screen, so the link is offered without one. Version 20 is 97
 * modules a side, about three pixels each here.
 */
const MAX_QR_VERSION = 20

const groups = STORAGE_GROUPS.filter((group): group is { id: PortableGroup; label: Localised } =>
  (PORTABLE_GROUPS as readonly string[]).includes(group.id),
)
// The shell is left out to begin with: the history is most of a save's size, and the
// most personal part of it.
const chosen = ref<PortableGroup[]>(['settings', 'progress', 'scores'])
const carried = computed(() => portableItems(chosen.value, live.value))
const bytesOf = (group: PortableGroup) => portableItems([group], live.value).reduce((sum, item) => sum + item.bytes, 0)
const countOf = (group: PortableGroup) => portableItems([group], live.value).length

const save = shallowRef<{ link: string; qr: string | null } | null>(null)
const copied = ref(false)
// A link made from an earlier choice, or before a write, would carry the wrong things.
watch(
  [chosen, live],
  () => {
    save.value = null
    copied.value = false
  },
  { deep: true },
)

async function make() {
  const code = await encodeSave(carried.value.map(({ key, value }) => ({ key, value })))
  const link = saveLink(window.location.origin, code)
  // The QR encoder is the tool's own, loaded only when a link is made.
  const { encodeQr, toSvg } = await import('@/tools/qr/qr')
  let qr: string | null = null
  try {
    const symbol = encodeQr(link, 'L')
    if (symbol.version <= MAX_QR_VERSION) qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(symbol))}`
  } catch {
    // Longer than any QR code holds: the link alone.
  }
  save.value = { link, qr }
}

async function copy() {
  if (!save.value) return
  try {
    await navigator.clipboard.writeText(save.value.link)
    copied.value = true
  } catch {
    // No clipboard (an insecure origin, a denied permission): the field is still selectable.
  }
}

const pasted = ref('')
const error = ref<Localised | null>(null)
const preview = shallowRef<{ items: SavedItem[]; dropped: string[] } | null>(null)
const restoring = ref(false)
const restoreSection = useTemplateRef<HTMLElement>('restore')

const ERRORS = {
  malformed: m.saveFile.malformed,
  version: m.saveFile.version,
  unsupported: m.saveFile.unsupported,
  'too-large': m.saveFile.tooLarge,
} as const

async function read() {
  error.value = null
  preview.value = null
  const result = await decodeSave(pasted.value)
  if (!result.ok) {
    error.value = ERRORS[result.reason]
    return
  }
  if (!result.items.length) error.value = m.saveFile.empty
  else preview.value = { items: result.items, dropped: result.dropped }
}

/** How each value compares with what this browser holds under the same key. */
function status(item: SavedItem): Localised {
  const here = live.value.find((stored) => stored.area === 'local' && stored.key === item.key)
  if (!here) return m.saveFile.fresh
  return here.value === item.value ? m.saveFile.same : m.saveFile.replaces
}

const changes = computed(() => preview.value?.items.filter((item) => status(item) !== m.saveFile.same) ?? [])

async function restore() {
  if (!changes.value.length) return
  restoring.value = true
  writeSave(changes.value)
  // As a clear does: achievements, the language and the scheme are read once at load.
  await reloadPage()
}

function cancel() {
  preview.value = null
  pasted.value = ''
}

const shown = (value: string) => (value.length > 60 ? `${value.slice(0, 59)}…` : value)

async function arrive(code: string) {
  pasted.value = code
  await read()
  await nextTick()
  restoreSection.value?.scrollIntoView({ block: 'start' })
}

// Opened from a save link: the code was taken out of the address as the page loaded
// (`lib/save-link.ts`). It is read and shown, never written.
onMounted(() => {
  const code = pendingSave()
  if (code) void arrive(code)
})

// A save link pasted into the address bar of this very page changes only the fragment,
// which loads nothing, so the startup code never sees it. The router does: the code comes
// out of the address the same way, and is read the same way.
const route = useRoute()
const router = useRouter()
watch(
  () => route.hash,
  (hash) => {
    if (!hash.startsWith(SAVE_MARKER)) return
    void router.replace({ hash: '' })
    void arrive(hash.slice(SAVE_MARKER.length))
  },
)
</script>

<template>
  <section class="space-y-4" aria-labelledby="privacy-carry" data-testid="save-file">
    <h2 id="privacy-carry" class="text-primary font-mono text-sm">## {{ t(m.saveFile.heading) }}</h2>
    <p class="text-sm text-foreground leading-relaxed"><CodeText :text="t(privacyCopy.saveIntro)" /></p>

    <fieldset class="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
      <legend class="sr-only">{{ t(m.saveFile.groups) }}</legend>
      <label v-for="group in groups" :key="group.id" class="inline-flex items-center gap-2 text-foreground cursor-pointer">
        <input v-model="chosen" type="checkbox" :value="group.id" class="accent-primary" />
        {{ t(group.label) }}
        <span class="text-muted-foreground">{{ countOf(group.id) }} · {{ formatBytes(bytesOf(group.id)) }}</span>
      </label>
    </fieldset>

    <p v-if="!carried.length" class="text-xs text-muted-foreground">{{ t(m.saveFile.nothing) }}</p>
    <button
      v-else
      type="button"
      data-testid="save-make"
      class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
      @click="make"
    >
      {{
        t(m.saveFile.make)
          .replace('{n}', String(carried.length))
          .replace('{size}', formatBytes(carried.reduce((sum, item) => sum + item.bytes, 0)))
      }}
    </button>

    <div v-if="save" class="space-y-3" data-testid="save-made">
      <img v-if="save.qr" :src="save.qr" :alt="t(m.saveFile.qrAlt)" class="w-72 max-w-full aspect-square rounded" />
      <p v-else class="text-xs text-muted-foreground">{{ t(m.saveFile.noQr) }}</p>
      <div class="flex gap-2">
        <input
          :value="save.link"
          readonly
          :aria-label="t(m.saveFile.link)"
          data-testid="save-link"
          class="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
          @click="copy"
        >
          {{ copied ? t(m.saveFile.copied) : t(m.saveFile.copy) }}
        </button>
      </div>
    </div>

    <section ref="restore" class="space-y-3 scroll-mt-20" aria-labelledby="privacy-restore">
      <h3 id="privacy-restore" class="text-accent font-mono text-sm">### {{ t(m.saveFile.restoreHeading) }}</h3>
      <p class="text-sm text-muted-foreground leading-relaxed">{{ t(privacyCopy.restoreIntro) }}</p>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          v-model="pasted"
          rows="2"
          spellcheck="false"
          :aria-label="t(m.saveFile.paste)"
          :placeholder="t(m.saveFile.paste)"
          data-testid="save-paste"
          class="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1 font-mono text-xs text-foreground break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!pasted.trim() || restoring"
          @click="read"
        >
          {{ t(m.saveFile.read) }}
        </button>
      </div>
      <p v-if="error" class="text-sm text-warning" role="alert">{{ t(error) }}</p>

      <div v-if="preview" class="space-y-3" data-testid="save-preview">
        <ul class="space-y-2 font-mono text-xs">
          <li
            v-for="item in preview.items"
            :key="item.key"
            class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,15rem)_1fr_auto] border-l-2 pl-3"
            :class="status(item) === m.saveFile.same ? 'border-border' : 'border-primary/40'"
          >
            <span class="text-foreground break-all">{{ item.key }}</span>
            <span class="text-muted-foreground break-all">
              <CodeText :text="t(entryFor(item.key, 'local')!.purpose)" /> · <span class="text-foreground/80">{{ shown(item.value) }}</span>
            </span>
            <span :class="status(item) === m.saveFile.same ? 'text-muted-foreground' : 'text-primary'">{{ t(status(item)) }}</span>
          </li>
        </ul>
        <p v-if="preview.dropped.length" class="text-xs text-muted-foreground">
          {{ t(m.saveFile.dropped).replace('{n}', String(preview.dropped.length)) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="save-restore"
            class="px-3 py-1 rounded border border-destructive/60 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            :disabled="!changes.length || restoring"
            @click="restore"
          >
            {{ restoring ? t(m.saveFile.restoring) : t(m.saveFile.restore).replace('{n}', String(changes.length)) }}
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
            :disabled="restoring"
            @click="cancel"
          >
            {{ t(m.privacy.cancel) }}
          </button>
        </div>
        <p class="text-xs text-muted-foreground" aria-live="polite">{{ t(privacyCopy.reloadNote) }}</p>
      </div>
    </section>
  </section>
</template>
