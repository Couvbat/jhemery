<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { now, nowCategories, profile, staleDays } from '@/content'
import { useLocale } from '@/i18n'

const { t, m, locale } = useLocale()

// Read once per visit: a page left open across midnight going stale under the reader
// is not a case worth a timer.
const stale = staleDays(now.updated, new Date())

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
        <h1 class="text-2xl md:text-3xl font-bold glow-cyan text-accent">
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
