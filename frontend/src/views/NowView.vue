<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  eventEnd,
  eventStart,
  feedFile,
  isExternal,
  isLive,
  now,
  nowCategories,
  profile,
  staleDays,
  upcomingEvents,
} from '@/content'
import { goTo } from '@/composables/useViewSwing'
import { useLocale } from '@/i18n'
import { relative } from '@/tools/time/time'

const { t, m, locale } = useLocale()

// Read once per visit: a page left open across midnight going stale under the reader
// is not a case worth a timer. The events follow the same rule; the footer's line is
// the one that ticks.
const at = new Date()
const stale = staleDays(now.updated, at)
const coming = upcomingEvents(at)

const intl = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-GB'))
// In the visitor's zone, named, since a set at 21:00 in Paris is at 20:00 in London.
const startLabel = (start: Date) =>
  new Intl.DateTimeFormat(intl.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(start)
const endLabel = (end: Date) => new Intl.DateTimeFormat(intl.value, { hour: '2-digit', minute: '2-digit' }).format(end)

const feed = computed(() => feedFile(locale.value))

const updatedLabel = computed(() =>
  new Date(`${now.updated}T00:00:00Z`).toLocaleDateString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }),
)
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-8">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">cat now.txt</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <span class="text-accent">#</span> {{ t(m.now.heading) }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground">
          {{ t(m.now.updated) }} <time :datetime="now.updated">{{ updatedLabel }}</time>
        </p>
        <p
          v-if="stale !== null"
          data-testid="now-stale"
          class="mt-3 text-sm text-warning border border-warning/40 rounded p-3"
        >
          {{ t(m.now.stale).replace('{n}', String(stale)) }}
        </p>
      </header>

      <section v-if="coming.length" aria-labelledby="coming-up" data-testid="now-events" class="space-y-4">
        <h2 id="coming-up" class="text-lg font-bold text-primary">
          <span class="text-primary/60">##</span> {{ t(m.now.upcoming) }}
        </h2>
        <ul class="space-y-4 font-mono text-sm">
          <li v-for="event in coming" :key="event.id" class="space-y-1 border-l-2 border-accent/50 pl-4">
            <p v-if="isLive(event, at)" class="text-primary">
              ● {{ t(m.now.live) }} · {{ t(m.now.until) }} {{ endLabel(eventEnd(event)) }}
            </p>
            <p v-else class="text-accent">
              <time :datetime="event.start">{{ startLabel(eventStart(event)) }}</time>
              <span class="text-muted-foreground"> · {{ relative(eventStart(event), at, locale) }}</span>
            </p>
            <p class="text-foreground">{{ t(event.title) }}</p>
            <p v-if="event.note" class="text-muted-foreground">{{ t(event.note) }}</p>
            <template v-if="event.where">
              <a
                v-if="isExternal(event.where)"
                :href="event.where"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:underline"
              >
                {{ t(m.now.go) }} ↗
              </a>
              <button v-else type="button" class="text-primary hover:underline" @click="goTo(event.where)">
                {{ t(m.now.go) }} →
              </button>
            </template>
          </li>
        </ul>
        <p class="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <!-- webcal: hands the feed to the calendar app as a subscription, which re-reads it. -->
          <a :href="`webcal://${profile.domain}/${feed}`" class="text-primary hover:underline">{{ t(m.now.subscribe) }}</a>
          <span aria-hidden="true">·</span>
          <a :href="`/${feed}`" download class="hover:text-primary hover:underline">{{ t(m.now.download) }}</a>
        </p>
      </section>

      <ul class="space-y-4 font-mono text-sm">
        <li
          v-for="(entry, i) in now.entries"
          :key="i"
          class="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4 border-l-2 border-primary/40 pl-4"
        >
          <span class="text-primary">{{ t(nowCategories[entry.category]) }}</span>
          <span class="text-foreground">{{ t(entry.text) }}</span>
        </li>
      </ul>

      <p class="text-xs text-muted-foreground">
        {{ t(m.now.about) }}
        <a
          href="https://nownownow.com/about"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
          >nownownow.com</a
        >
        · <RouterLink to="/" class="text-primary hover:underline">~</RouterLink>
      </p>
    </div>
  </main>
</template>
