<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { profile } from '@/content'
import { acknowledgments, POLICY_UPDATED, securityCopy, securityLabels as labels } from '@/content/security'
import CodeText from '@/components/CodeText.vue'
import { useLocale } from '@/i18n'

const { t, m, locale } = useLocale()

const intl = computed(() => (locale.value === 'fr' ? 'fr-FR' : 'en-GB'))
const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(intl.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-10">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">cat /.well-known/security.txt</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <span class="text-accent">#</span> {{ t(m.security.heading) }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground">
          {{ t(labels.updated) }} <time :datetime="POLICY_UPDATED">{{ day(POLICY_UPDATED) }}</time>
        </p>
        <p class="mt-3 text-sm text-foreground leading-relaxed">{{ t(securityCopy.intro) }}</p>
      </header>

      <section class="space-y-3" aria-labelledby="security-report">
        <h2 id="security-report" class="text-primary font-mono text-sm">## {{ t(labels.report) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(securityCopy.report) }}</p>
        <p class="font-mono text-sm">
          <a :href="`mailto:${profile.email}`" data-testid="security-contact" class="text-primary hover:underline">{{ profile.email }}</a>
        </p>
        <p class="text-sm text-muted-foreground leading-relaxed">{{ t(securityCopy.expect) }}</p>
      </section>

      <section class="space-y-3" aria-labelledby="security-in">
        <h2 id="security-in" class="text-primary font-mono text-sm">## {{ t(labels.inScope) }}</h2>
        <ul class="space-y-3 text-sm text-foreground leading-relaxed">
          <li v-for="(item, i) in securityCopy.inScope" :key="i" class="border-l-2 border-primary/40 pl-4">
            <CodeText :text="t(item)" />
          </li>
        </ul>
      </section>

      <section class="space-y-3" aria-labelledby="security-out">
        <h2 id="security-out" class="text-primary font-mono text-sm">## {{ t(labels.outOfScope) }}</h2>
        <ul class="space-y-3 text-sm text-foreground leading-relaxed">
          <li v-for="(item, i) in securityCopy.outOfScope" :key="i" class="border-l-2 border-border pl-4">
            <CodeText :text="t(item)" />
          </li>
        </ul>
      </section>

      <section class="space-y-3" aria-labelledby="security-harbour">
        <h2 id="security-harbour" class="text-primary font-mono text-sm">## {{ t(labels.harbour) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(securityCopy.safeHarbour) }}</p>
      </section>

      <section id="thanks" class="space-y-3" aria-labelledby="security-thanks">
        <h2 id="security-thanks" class="text-primary font-mono text-sm">## {{ t(labels.thanks) }}</h2>
        <ul v-if="acknowledgments.length" class="space-y-2 font-mono text-sm">
          <li v-for="entry in acknowledgments" :key="`${entry.date}:${entry.name}`" class="grid gap-x-4 sm:grid-cols-[9rem_1fr] border-l-2 border-primary/40 pl-4">
            <time :datetime="entry.date" class="text-muted-foreground">{{ day(entry.date) }}</time>
            <span class="text-foreground">
              <a v-if="entry.url" :href="entry.url" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{{ entry.name }}</a>
              <template v-else>{{ entry.name }}</template>
              — {{ t(entry.what) }}
            </span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">{{ t(securityCopy.noThanks) }}</p>
      </section>

      <p class="text-xs text-muted-foreground">
        <a href="/.well-known/security.txt" class="text-primary hover:underline">security.txt</a>
        · <RouterLink to="/privacy" class="text-primary hover:underline">/privacy</RouterLink>
        · <RouterLink to="/" class="text-primary hover:underline">~</RouterLink>
      </p>
    </div>
  </main>
</template>
