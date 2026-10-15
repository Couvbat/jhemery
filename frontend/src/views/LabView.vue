<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { profile } from '@/content'
import CodeText from '@/components/CodeText.vue'
import AskTheLab from '@/components/lab/AskTheLab.vue'
import LabMap from '@/components/lab/LabMap.vue'
import { labLabels as labels } from '@/components/lab/labels'
import { useLocale } from '@/i18n'
import { api, type LabReport } from '@/lib/api'
import { feedLine, feedOf } from '@/lib/lab'

/**
 * `/lab`: the homelab behind the site as a live map (the lab map spec,
 * `docs/superpowers/specs/2026-10-15-lab-map-design.md`). Outside the prism like `/now`,
 * so the navbar keeps its width; linked from the footer.
 *
 * The topology is built in (`content/lab.ts`) and `GET /lab` only colours it, so the
 * map is a correct diagram with the feed off or the API down. The page polls every
 * 30 s while it is visible and stops when it isn't, as a background request `strace`
 * leaves out; the API stays out of the PWA's runtime caching, since a stale "up" is
 * worse than an honest "unavailable".
 */
const POLL_MS = 30_000
/** The strip's age keeps counting between polls, at a pace nobody reads as motion. */
const TICK_MS = 5_000

const { t, locale } = useLocale()

/** `undefined` until the first answer, `null` when the API didn't give one. */
const report = shallowRef<LabReport | null | undefined>(undefined)
const fetchedAt = ref(0)
const now = ref(Date.now())

async function poll() {
  if (document.hidden) return
  try {
    report.value = await api.lab({ background: true })
  } catch {
    report.value = null
  }
  fetchedAt.value = Date.now()
  now.value = fetchedAt.value
}

let pollTimer: ReturnType<typeof setInterval> | undefined
let tickTimer: ReturnType<typeof setInterval> | undefined

function start() {
  stop()
  void poll()
  pollTimer = setInterval(() => void poll(), POLL_MS)
  tickTimer = setInterval(() => (now.value = Date.now()), TICK_MS)
}

function stop() {
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  pollTimer = tickTimer = undefined
}

const onVisibility = () => (document.hidden ? stop() : start())

onMounted(() => {
  start()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisibility)
})

/** The report as of now: its age moved on by the time since it was fetched. */
const current = computed<LabReport | null | undefined>(() => {
  const value = report.value
  if (!value?.configured || value.ageMs === null) return value
  return { ...value, ageMs: value.ageMs + Math.max(0, now.value - fetchedAt.value) }
})

const feed = computed(() => (current.value === undefined ? null : feedOf(current.value)))
const strip = computed(() =>
  current.value === undefined ? t(labels.asking) : feedLine(current.value, locale.value),
)
const stripTone = computed(() =>
  feed.value === 'live' ? 'text-primary border-primary/40' : feed.value === null ? 'text-muted-foreground border-border' : 'text-warning border-warning/40',
)
</script>

<template>
  <main class="scanlines min-h-screen pt-14" data-api="/lab">
    <div class="max-w-6xl mx-auto px-4 py-16 md:py-20 space-y-8">
      <header class="max-w-3xl">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">lab --map</span>
        </p>
        <h1
          tabindex="-1"
          class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <span class="text-accent">#</span> {{ t(labels.heading) }}
        </h1>
        <p class="mt-3 text-sm text-foreground/90">{{ t(labels.intro) }}</p>
      </header>

      <p data-testid="lab-feed" :data-feed="feed ?? 'loading'" :class="['inline-flex items-center gap-2 border rounded px-3 py-1.5 font-mono text-xs', stripTone]">
        <span aria-hidden="true">{{ feed === 'live' ? '●' : '○' }}</span>{{ strip }}
      </p>

      <LabMap :report="current" />

      <AskTheLab />

      <p class="text-xs text-muted-foreground font-mono">
        <CodeText :text="t(labels.outside)" />
        · <RouterLink to="/" class="text-primary hover:underline">~</RouterLink>
      </p>
    </div>
  </main>
</template>
