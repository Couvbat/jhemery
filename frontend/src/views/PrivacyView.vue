<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { profile } from '@/content'
import { privacyCopy, privacyLabels } from '@/content/privacy'
import type { Localised } from '@/content/types'
import CodeText from '@/components/CodeText.vue'
import SaveFile from '@/components/SaveFile.vue'
import { useStoredItems } from '@/composables/useStoredItems'
import { useLocale } from '@/i18n'
import { analyticsConfigured, analyticsRefused, refuseAnalytics } from '@/lib/analytics'
import {
  EMBEDS_NOTE,
  HTTP_CACHE_NOTE,
  STALE_LABEL,
  STALE_PURPOSE,
  STORAGE_GROUPS,
  STORAGE_KEYS,
  WORKBOX_NOTE,
  cachePurpose,
  cacheReport,
  groupOf,
  reloadPage,
  removeItems,
  storedItems,
  type CacheReport,
  type StorageGroup,
  type StoredItem,
} from '@/lib/storage-keys'
import { CORE_BYTES } from '@/tools/ffmpeg/media'
import { formatBytes } from '@/tools/image/image'

const { t, m } = useLocale()

type Group = StorageGroup | 'stale'

interface Row {
  key: string
  purpose: Localised
  area: 'localStorage' | 'sessionStorage'
  secret: boolean
  item?: StoredItem
}

const live = useStoredItems()
// Held once a clear starts, until the reload: the rows go on showing what went, and a
// cleared stale group doesn't vanish from under its own "Cleared" note.
const held = shallowRef<StoredItem[] | null>(null)
const items = computed(() => held.value ?? live.value)

/**
 * Every key on the list, set or not: the page is the disclosure, so a key the visitor
 * hasn't made yet is still one they should know about. A prefix row shows each stored key
 * under it, or the prefix itself with a placeholder when there are none.
 */
const groups = computed(() => {
  const listed: { id: Group; label: Localised }[] = [...STORAGE_GROUPS]
  if (items.value.some((item) => !item.entry)) listed.push({ id: 'stale', label: STALE_LABEL })
  return listed.map(({ id, label }) => {
    const stored = items.value.filter((item) => groupOf(item) === id)
    const area = (a: 'local' | 'session') => (a === 'local' ? 'localStorage' : 'sessionStorage') as Row['area']
    const rows: Row[] =
      id === 'stale'
        ? stored.map((item) => ({ key: item.key, purpose: STALE_PURPOSE, area: area(item.area), secret: false, item }))
        : STORAGE_KEYS.filter((entry) => entry.group === id).flatMap((entry) => {
            const base = { purpose: entry.purpose, area: area(entry.area), secret: !!entry.secret }
            const mine = stored.filter((item) => item.entry === entry)
            if (mine.length) return mine.map((item) => ({ ...base, key: item.key, item }))
            return [{ ...base, key: entry.prefix ? `${entry.key}<code>` : entry.key }]
          })
    const bytes = stored.reduce((sum, item) => sum + item.bytes, 0)
    return { id, label, rows, stored, bytes }
  })
})

/**
 * Clearing takes two presses on two different buttons. The first arms the group and its
 * own button turns into Cancel where it stands, so a double-click, or Enter pressed twice,
 * cancels instead of clearing; the confirm appears beside it and says what it will do.
 */
const armed = ref<Group | null>(null)
const clearing = ref(false)

function toggle(group: Group) {
  armed.value = armed.value === group ? null : group
}

/**
 * Escape disarms from either button. The confirm goes with it, so focus moves to the
 * group's own button first, rather than falling to `<body>` with the button it was on.
 * The key is claimed, as a dialog claims it, so the same press doesn't also end x-ray.
 */
function disarm(event: KeyboardEvent) {
  if (!armed.value) return
  event.preventDefault()
  const own = (event.currentTarget as HTMLElement).querySelector('button')
  own?.focus()
  armed.value = null
}

async function clear(group: Group) {
  held.value = items.value
  clearing.value = true
  // Storage as it is now, not the rows: the button says the group, so all of it goes.
  removeItems(storedItems().filter((item) => groupOf(item) === group))
  await reloadPage()
}

const report = ref<CacheReport | null>(null)
onMounted(async () => {
  report.value = await cacheReport()
})

const claims = [
  privacyCopy.presence,
  privacyCopy.stats,
  privacyCopy.ask,
  privacyCopy.analytics,
  privacyCopy.contact,
  privacyCopy.guestbook,
  privacyCopy.addresses,
  privacyCopy.cloudflare,
  privacyCopy.embeds,
  privacyCopy.upstream,
  privacyCopy.xray,
]

// A build that counts nothing has nothing to refuse, so the switch only shows where it acts.
const counting = analyticsConfigured()
const refused = analyticsRefused()
const switching = ref(false)
// Storage full or blocked: nothing changed, and the page says so instead of reloading into
// the same state as if it had worked.
const unsaved = ref(false)

async function switchCounting() {
  unsaved.value = !refuseAnalytics(!refused)
  if (unsaved.value) return
  switching.value = true
  await reloadPage()
}
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-10">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">du -h ~</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <span class="text-accent">#</span> {{ t(m.privacy.heading) }}
        </h1>
        <p class="mt-3 text-sm text-foreground leading-relaxed"><CodeText :text="t(privacyCopy.intro)" /></p>
      </header>

      <section class="space-y-6" aria-labelledby="privacy-browser">
        <h2 id="privacy-browser" class="text-primary font-mono text-sm">## {{ t(privacyLabels.browser) }}</h2>

        <section
          v-for="group in groups"
          :key="group.id"
          :data-testid="`privacy-group-${group.id}`"
          class="space-y-2"
          :aria-labelledby="`privacy-group-${group.id}`"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-sm">
            <h3 :id="`privacy-group-${group.id}`" class="text-accent">### {{ t(group.label) }}</h3>
            <span class="text-xs text-muted-foreground">
              {{ t(privacyLabels.stored).replace('{n}', String(group.stored.length)).replace('{size}', formatBytes(group.bytes)) }}
            </span>
            <div class="ml-auto flex flex-wrap gap-2" @keydown.esc="disarm">
              <button
                type="button"
                class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
                :disabled="!group.stored.length || clearing"
                :aria-expanded="armed === group.id"
                @click="toggle(group.id)"
              >
                {{ armed === group.id ? t(privacyLabels.cancel) : `${t(privacyLabels.clear)} ${t(group.label)}` }}
              </button>
              <button
                v-if="armed === group.id"
                type="button"
                class="px-3 py-1 rounded border border-destructive/60 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                :disabled="clearing"
                @click="clear(group.id)"
              >
                {{ clearing ? t(privacyLabels.cleared) : t(privacyLabels.confirm).replace('{n}', String(group.stored.length)) }}
              </button>
            </div>
          </div>
          <p v-if="armed === group.id" class="text-xs text-muted-foreground" aria-live="polite">
            {{ t(privacyCopy.reloadNote) }}
          </p>

          <ul class="space-y-2 font-mono text-xs">
            <li
              v-for="row in group.rows"
              :key="`${row.area}:${row.key}`"
              class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,15rem)_1fr_auto] border-l-2 pl-3"
              :class="row.item ? 'border-primary/40' : 'border-border'"
            >
              <span class="text-foreground break-all">{{ row.key }}</span>
              <span class="text-muted-foreground">
                <CodeText :text="t(row.purpose)" /> · {{ row.area }}<template v-if="row.secret"> · {{ t(privacyLabels.secret) }}</template>
              </span>
              <span :class="row.item ? 'text-primary' : 'text-muted-foreground'">
                {{ row.item ? formatBytes(row.item.bytes) : t(privacyLabels.notSet) }}
              </span>
            </li>
          </ul>
        </section>
      </section>

      <SaveFile />

      <section class="space-y-3" aria-labelledby="privacy-caches">
        <h2 id="privacy-caches" class="text-primary font-mono text-sm">## {{ t(privacyLabels.caches) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(privacyCopy.cachesIntro) }}</p>
        <template v-if="report">
          <ul v-if="report.caches?.length" class="space-y-2 font-mono text-xs" data-testid="privacy-caches">
            <li
              v-for="store in report.caches"
              :key="store.name"
              class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,15rem)_1fr_auto] border-l-2 border-border pl-3"
            >
              <span class="text-foreground break-all">{{ store.name }}</span>
              <span class="text-muted-foreground">
                <template v-if="cachePurpose(store.name)">{{ t(cachePurpose(store.name)!) }} · </template>{{ t(privacyLabels.files).replace('{n}', String(store.files)) }}
              </span>
              <span class="text-primary">{{ formatBytes(store.bytes) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">{{ t(privacyLabels.noCaches) }}</p>
          <p v-if="report.caches?.length" class="text-sm text-muted-foreground">{{ t(WORKBOX_NOTE) }}</p>
          <p v-if="report.usage !== null" data-testid="storage-estimate" class="text-sm text-muted-foreground">
            <CodeText :text="t(m.privacy.estimate).replace('{size}', formatBytes(report.usage))" />
          </p>
        </template>
        <p class="text-sm text-muted-foreground">{{ t(HTTP_CACHE_NOTE).replace('{size}', formatBytes(CORE_BYTES)) }}</p>
        <p class="text-sm text-muted-foreground">{{ t(EMBEDS_NOTE) }}</p>
      </section>

      <section class="space-y-3" aria-labelledby="privacy-sends">
        <h2 id="privacy-sends" class="text-primary font-mono text-sm">## {{ t(privacyLabels.sends) }}</h2>
        <ul class="space-y-3 text-sm text-foreground leading-relaxed">
          <li v-for="(claim, i) in claims" :key="i" class="border-l-2 border-primary/40 pl-4"><CodeText :text="t(claim)" /></li>
        </ul>
        <div v-if="counting" data-testid="privacy-counting" class="space-y-2">
          <h3 class="text-accent font-mono text-sm">### {{ t(privacyLabels.counting) }}</h3>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p class="text-sm text-foreground">{{ t(refused ? privacyCopy.analyticsOff : privacyCopy.analyticsOn) }}</p>
            <button
              type="button"
              class="px-3 py-1 rounded border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
              :disabled="switching"
              @click="switchCounting"
            >
              {{ switching ? t(privacyLabels.cleared) : t(refused ? privacyLabels.allow : privacyLabels.refuse) }}
            </button>
          </div>
          <p v-if="unsaved" class="text-xs text-warning" role="alert">{{ t(privacyLabels.unsaved) }}</p>
        </div>
        <p class="text-sm text-foreground leading-relaxed"><CodeText :text="t(privacyCopy.strace)" /></p>
      </section>

      <section class="space-y-3" aria-labelledby="privacy-who">
        <h2 id="privacy-who" class="text-primary font-mono text-sm">## {{ t(privacyLabels.who) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(privacyCopy.controller) }}</p>
        <p class="text-sm text-foreground leading-relaxed">{{ t(privacyCopy.bases) }}</p>
      </section>

      <section class="space-y-3" aria-labelledby="privacy-rights">
        <h2 id="privacy-rights" class="text-primary font-mono text-sm">## {{ t(privacyLabels.rights) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">
          {{ t(privacyCopy.rights) }}
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">cnil.fr ↗</a>
        </p>
      </section>

      <p class="text-xs text-muted-foreground">
        <RouterLink to="/legal" class="text-primary hover:underline">/legal</RouterLink>
        · <RouterLink to="/now" class="text-primary hover:underline">/now</RouterLink>
        · <RouterLink to="/security" class="text-primary hover:underline">/security</RouterLink>
        · <RouterLink to="/" class="text-primary hover:underline">~</RouterLink>
      </p>
    </div>
  </main>
</template>
