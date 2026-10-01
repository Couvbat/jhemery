<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { findWork, noteSlug, profile, work } from '@/content'
import CodeText from '@/components/CodeText.vue'
import { useLocale } from '@/i18n'
import { docUrl, sourceUrl } from '@/lib/source'
import { triesPath, tryHref } from '@/terminal/work'

const { t, m } = useLocale()
const route = useRoute()

const part = computed(() => findWork(String(route.params.id ?? '')))
const index = computed(() => (part.value ? work.indexOf(part.value) : -1))
const previous = computed(() => (index.value > 0 ? work[index.value - 1] : undefined))
const next = computed(() => (index.value >= 0 && index.value < work.length - 1 ? work[index.value + 1] : undefined))
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-8">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">cat projects/{{ part?.id ?? route.params.id }}.md</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent focus:outline-none">
          <span class="text-accent">#</span> {{ part ? t(part.name) : t(m.projects.work) }}
        </h1>
        <p v-if="part" class="mt-3 text-foreground"><CodeText :text="t(part.summary)" /></p>
      </header>

      <template v-if="part">
        <section class="space-y-3">
          <h2 class="text-primary font-mono text-sm">## {{ t(m.work.hard) }}</h2>
          <p v-for="(paragraph, i) in t(part.hard)" :key="i" class="text-sm text-foreground leading-relaxed">
            <CodeText :text="paragraph" />
          </p>
        </section>

        <section v-if="part.numbers.length" class="space-y-2">
          <h2 class="text-primary font-mono text-sm">## {{ t(m.work.numbers) }}</h2>
          <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,14rem)_1fr] font-mono text-sm">
            <template v-for="(n, i) in part.numbers" :key="i">
              <dt class="text-muted-foreground"><CodeText :text="t(n.label)" /></dt>
              <dd class="text-foreground">{{ n.value }}</dd>
            </template>
          </dl>
        </section>

        <section class="space-y-2 font-mono text-sm">
          <p v-if="part.try">
            <RouterLink v-if="triesPath(part.try)" :to="tryHref(part.try)" class="text-primary hover:underline">
              {{ t(m.work.tryIt) }} → {{ part.try }}
            </RouterLink>
            <!-- A `?run=` link is read when a page loads, so this one loads the page. -->
            <a v-else :href="tryHref(part.try)" class="text-primary hover:underline">{{ t(m.work.tryIt) }} → {{ part.try }}</a>
          </p>
          <p class="text-muted-foreground">{{ t(m.work.code) }}</p>
          <ul class="pl-4 space-y-1">
            <li v-for="path in part.code" :key="path">
              <a :href="sourceUrl(path)" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline break-all">{{ path }}</a>
            </li>
          </ul>
          <p>
            <a :href="docUrl(part.spec)" class="text-accent hover:underline">{{ t(m.work.design) }} → {{ noteSlug(part.spec.doc) }}</a>
          </p>
          <p v-if="part.decisions?.length" class="text-muted-foreground">
            {{ t(m.work.decisions) }}:
            <template v-for="(id, i) in part.decisions" :key="id">
              <a :href="tryHref(`why ${id}`)" class="text-accent hover:underline">why {{ id }}</a
              ><span v-if="i < part.decisions.length - 1">, </span>
            </template>
          </p>
        </section>

        <nav class="flex justify-between gap-4 text-xs font-mono border-t border-border pt-4">
          <RouterLink v-if="previous" :to="`/work/${previous.id}`" class="text-primary hover:underline">
            ← {{ t(m.work.previous) }}: {{ t(previous.name) }}
          </RouterLink>
          <span v-else />
          <RouterLink v-if="next" :to="`/work/${next.id}`" class="text-primary hover:underline">
            {{ t(m.work.next) }}: {{ t(next.name) }} →
          </RouterLink>
        </nav>
      </template>

      <template v-else>
        <p class="text-sm text-muted-foreground">{{ t(m.work.notFound) }}</p>
        <ul class="space-y-2 font-mono text-sm">
          <li v-for="p in work" :key="p.id">
            <RouterLink :to="`/work/${p.id}`" class="text-primary hover:underline">{{ t(p.name) }}</RouterLink>
          </li>
        </ul>
      </template>

      <p class="text-xs text-muted-foreground">
        <RouterLink to="/#projects" class="text-primary hover:underline">~/projects</RouterLink> · {{ t(m.work.back) }}
      </p>
    </div>
  </main>
</template>
