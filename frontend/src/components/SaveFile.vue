<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { privacyCopy, privacyLabels, saveFileLabels as labels } from '@/content/privacy'
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
import { STORAGE_GROUPS, entryFor, reloadPage, shortName } from '@/lib/storage-keys'
import { formatBytes } from '@/tools/image/image'

/**
 * The save file's two halves on `/privacy` (`lib/save-file.ts`): make a link of what this
 * browser keeps, and restore one here. Its own component so the page that lists and clears
 * stays readable; it reads the same live list.
 */

const { t } = useLocale()
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

const save = shallowRef<{ link: string; qr: string | null; tooBig: string[] } | null>(null)
const copied = ref(false)
/**
 * The link being made, while it is. Making one waits on compression and on the QR module,
 * and a change of choice or of storage in that wait voids it: unticking the shell then must
 * not publish a link that still holds the history.
 */
let making: object | null = null
// A link made from an earlier choice, or before a write, would carry the wrong things.
watch(
  [chosen, live],
  () => {
    save.value = null
    copied.value = false
    making = null
  },
  { deep: true },
)

async function make() {
  const mine = {}
  making = mine
  const { code, tooBig } = await encodeSave(carried.value.map(({ key, value }) => ({ key, value })))
  const link = saveLink(window.location.origin, code)
  // The QR encoder is the tool's own, loaded only when a link is made.
  const { encodeQr, toSvg } = await import('@/tools/qr/qr')
  if (making !== mine) return
  let qr: string | null = null
  try {
    const symbol = encodeQr(link, 'L')
    if (symbol.version <= MAX_QR_VERSION) qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(symbol))}`
  } catch {
    // Longer than any QR code holds: the link alone.
  }
  save.value = { link, qr, tooBig }
  making = null
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
  malformed: labels.malformed,
  version: labels.version,
  unsupported: labels.unsupported,
  'too-large': labels.tooLarge,
} as const

async function read() {
  error.value = null
  preview.value = null
  const result = await decodeSave(pasted.value)
  if (!result.ok) {
    error.value = ERRORS[result.reason]
    return
  }
  if (!result.items.length) error.value = labels.empty
  else preview.value = { items: result.items, dropped: result.dropped }
}

/** How each value compares with what this browser holds under the same key. */
function status(item: SavedItem): Localised {
  const here = live.value.find((stored) => stored.area === 'local' && stored.key === item.key)
  if (!here) return labels.fresh
  return here.value === item.value ? labels.same : labels.replaces
}

const changes = computed(() => preview.value?.items.filter((item) => status(item) !== labels.same) ?? [])

async function restore() {
  const wanted = changes.value
  if (!wanted.length) return
  const written = writeSave(wanted)
  // A full or blocked storage keeps some of it out. Say so and stay, rather than announce
  // a restore and reload: the preview then shows which took, and what's left to retry.
  if (written.length < wanted.length) {
    error.value = {
      en: fillCounts(labels.writeFailed.en, wanted.length - written.length, wanted.length),
      fr: fillCounts(labels.writeFailed.fr, wanted.length - written.length, wanted.length),
    }
    return
  }
  restoring.value = true
  // As a clear does: achievements, the language and the scheme are read once at load.
  await reloadPage()
}

const fillCounts = (text: string, n: number, total: number) => text.replace('{n}', String(n)).replace('{total}', String(total))

function cancel() {
  preview.value = null
  pasted.value = ''
}

const shown = (value: string) => (value.length > 60 ? `${value.slice(0, 59)}…` : value)

/**
 * A save's aliases, every one in full. They are the one thing in a save that later runs
 * commands, when their name is typed, so cut to sixty characters a link from someone else
 * could hide `ll → rm -rf ~` after a few harmless ones. Anything not a name-to-string map
 * shows as nothing here; `aliases.ts` reads it as none.
 */
function aliasesIn(value: string): [string, string][] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  } catch {
    return []
  }
}

async function arrive(code: string) {
  pasted.value = code
  await read()
  await nextTick()
  // Centred, so the fixed navbar can't cover its heading.
  restoreSection.value?.scrollIntoView({ block: 'center' })
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
    <h2 id="privacy-carry" class="text-primary font-mono text-sm">## {{ t(labels.heading) }}</h2>
    <p class="text-sm text-foreground leading-relaxed"><CodeText :text="t(privacyCopy.saveIntro)" /></p>

    <fieldset class="flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs">
      <legend class="sr-only">{{ t(labels.groups) }}</legend>
      <label v-for="group in groups" :key="group.id" class="inline-flex items-center gap-2 text-foreground cursor-pointer">
        <input v-model="chosen" type="checkbox" :value="group.id" class="accent-[var(--neon-green)]" />
        {{ t(group.label) }}
        <span class="text-muted-foreground">{{ countOf(group.id) }} · {{ formatBytes(bytesOf(group.id)) }}</span>
      </label>
    </fieldset>

    <p v-if="!carried.length" class="text-xs text-muted-foreground">{{ t(labels.nothing) }}</p>
    <button
      v-else
      type="button"
      data-testid="save-make"
      class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
      @click="make"
    >
      {{
        t(labels.make)
          .replace('{n}', String(carried.length))
          .replace('{size}', formatBytes(carried.reduce((sum, item) => sum + item.bytes, 0)))
      }}
    </button>

    <div v-if="save" class="space-y-3" data-testid="save-made">
      <img v-if="save.qr" :src="save.qr" :alt="t(labels.qrAlt)" class="w-64 max-w-full rounded" />
      <p v-else class="text-xs text-muted-foreground">{{ t(labels.noQr) }}</p>
      <p v-if="save.tooBig.length" class="text-xs text-warning" role="status">
        {{ t(labels.tooBig).replace('{keys}', save.tooBig.join(', ')) }}
      </p>
      <div class="flex gap-2">
        <input
          :value="save.link"
          readonly
          :aria-label="t(labels.link)"
          data-testid="save-link"
          class="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
          @click="copy"
        >
          {{ copied ? t(labels.copied) : t(labels.copy) }}
        </button>
      </div>
    </div>

    <section ref="restore" class="space-y-3" aria-labelledby="privacy-restore">
      <h3 id="privacy-restore" class="text-accent font-mono text-sm">### {{ t(labels.restoreHeading) }}</h3>
      <p class="text-sm text-muted-foreground leading-relaxed">{{ t(privacyCopy.restoreIntro) }}</p>
      <div class="flex items-start gap-2">
        <textarea
          v-model="pasted"
          rows="2"
          spellcheck="false"
          :aria-label="t(labels.paste)"
          :placeholder="t(labels.paste)"
          data-testid="save-paste"
          class="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1 font-mono text-xs text-foreground break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!pasted.trim() || restoring"
          @click="read"
        >
          {{ t(labels.read) }}
        </button>
      </div>
      <p v-if="error" class="text-sm text-warning" role="alert">{{ t(error) }}</p>

      <div v-if="preview" class="space-y-3" data-testid="save-preview">
        <ul class="space-y-2 font-mono text-xs">
          <li
            v-for="item in preview.items"
            :key="item.key"
            class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,15rem)_1fr_auto] border-l-2 pl-3"
            :class="status(item) === labels.same ? 'border-border' : 'border-primary/40'"
          >
            <span class="text-foreground break-all">{{ item.key }}</span>
            <span class="text-muted-foreground break-all">
              <CodeText :text="t(entryFor(item.key, 'local')!.purpose)" />
              <template v-if="shortName(item.key) === 'aliases'">
                <span v-for="[name, body] in aliasesIn(item.value)" :key="name" class="block text-foreground" data-testid="save-alias">{{ name }} → {{ body }}</span>
              </template>
              <template v-else> · <span class="text-foreground">{{ shown(item.value) }}</span></template>
            </span>
            <span :class="status(item) === labels.same ? 'text-muted-foreground' : 'text-primary'">{{ t(status(item)) }}</span>
          </li>
        </ul>
        <p v-if="preview.dropped.length" class="text-xs text-muted-foreground">
          {{ t(labels.dropped).replace('{n}', String(preview.dropped.length)) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="save-restore"
            class="px-3 py-1 rounded border border-destructive/60 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            :disabled="!changes.length || restoring"
            @click="restore"
          >
            {{ restoring ? t(labels.restoring) : t(labels.restore).replace('{n}', String(changes.length)) }}
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
            :disabled="restoring"
            @click="cancel"
          >
            {{ t(privacyLabels.cancel) }}
          </button>
        </div>
        <p class="text-xs text-muted-foreground" aria-live="polite">{{ t(privacyCopy.reloadNote) }}</p>
      </div>
    </section>
  </section>
</template>
