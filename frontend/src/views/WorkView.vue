<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { findDecision, findWork, profile, work } from '@/content'
import CodeText from '@/components/CodeText.vue'
import { useLocale } from '@/i18n'
import { docUrl, isNote, sourceUrl } from '@/lib/source'
import { designLabel, figure, triesPath, tryHref } from '@/terminal/work'

// A route prop rather than `useRoute()`: the face that turns away during the prism swing
// keeps its own id, where the app-wide route would already be the next page's and flip
// it to "not found" mid-turn.
const props = defineProps<{ id: string }>()
const { t, m } = useLocale()

const part = computed(() => findWork(props.id))
const index = computed(() => (part.value ? work.indexOf(part.value) : -1))
const previous = computed(() => (index.value > 0 ? work[index.value - 1] : undefined))
const next = computed(() => (index.value >= 0 && index.value < work.length - 1 ? work[index.value + 1] : undefined))
const decisions = computed(() => (part.value?.decisions ?? []).flatMap((id) => findDecision(id) ?? []))
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-8">
      <header>
        <!-- Only a real part gets the prompt line: an unknown id is the URL's text, and a
             link's author must not get to type a line in the owner's shell. -->
        <p v-if="part" class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">cat projects/{{ part.id }}.md</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
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
              <dd class="text-foreground">{{ figure(n.value, t) }}</dd>
            </template>
          </dl>
        </section>

        <section class="space-y-2 font-mono text-sm">
          <p v-if="part.try">
            <RouterLink v-if="triesPath(part.try)" :to="tryHref(part.try)" class="text-primary hover:underline">
              {{ t(m.work.tryIt) }} → {{ part.try }}
            </RouterLink>
            <template v-else>
              <!-- A `?run=` link is read when a page loads, so this one loads the page; below
                   md there is no terminal to read it, so the command is only named. -->
              <a :href="tryHref(part.try)" class="hidden md:inline text-primary hover:underline">{{ t(m.work.tryIt) }} → {{ part.try }}</a>
              <span class="md:hidden text-muted-foreground"
                >{{ t(m.work.tryIt) }} → <code class="text-foreground">{{ part.try }}</code>, {{ t(m.work.tryWide) }}</span
              >
            </template>
          </p>
          <p class="text-muted-foreground">{{ t(m.work.code) }}</p>
          <ul class="pl-4 space-y-1">
            <li v-for="path in part.code" :key="path">
              <a :href="sourceUrl(path)" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline break-all">{{ path }}</a>
            </li>
          </ul>
          <p>
            <a
              :href="docUrl(part.spec)"
              v-bind="isNote(part.spec.doc) ? {} : { target: '_blank', rel: 'noopener noreferrer' }"
              class="text-accent hover:underline"
              >{{ designLabel(part, t) }}</a
            >
          </p>
          <p v-if="decisions.length" class="text-muted-foreground">
            {{ t(m.work.decisions) }}:
            <template v-for="(decision, i) in decisions" :key="decision.id">
              <!-- `why` in the terminal where there is one; its design note where there isn't. -->
              <a :href="tryHref(`why ${decision.id}`)" class="hidden md:inline text-accent hover:underline">why {{ decision.id }}</a
              ><a :href="docUrl(decision.source)" class="md:hidden text-accent hover:underline">{{ t(decision.topic) }}</a
              ><span v-if="i < decisions.length - 1">, </span>
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
