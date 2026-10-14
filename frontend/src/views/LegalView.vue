<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { profile } from '@/content'
import { cdn, credits, host, legalCopy, type Company } from '@/content/legal'
import CodeText from '@/components/CodeText.vue'
import { useLocale } from '@/i18n'

const { t, m } = useLocale()

const repo = 'https://github.com/Couvbat/jhemery'

const operators = [
  { intro: legalCopy.host, company: host },
  { intro: legalCopy.cdn, company: cdn },
]

function companyLines(company: Company): string[] {
  return [
    company.name,
    company.address,
    ...(company.phone ? [`${t(m.legal.phone)} ${company.phone}`] : []),
    ...(company.siren ? [`SIREN ${company.siren}`] : []),
  ]
}
</script>

<template>
  <main class="scanlines min-h-screen pt-14">
    <div class="max-w-3xl mx-auto px-4 py-16 md:py-20 space-y-10">
      <header>
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">{{ profile.handle }}</span
          ><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">whois {{ profile.domain }}</span>
        </p>
        <h1 tabindex="-1" class="text-2xl md:text-3xl font-bold glow-cyan text-accent rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
          <span class="text-accent">#</span> {{ t(m.legal.heading) }}
        </h1>
      </header>

      <section class="space-y-3" aria-labelledby="legal-publisher">
        <h2 id="legal-publisher" class="text-primary font-mono text-sm">## {{ t(m.legal.publisher) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(legalCopy.publisher) }}</p>
        <p class="text-sm text-foreground leading-relaxed"><CodeText :text="t(legalCopy.contact)" /></p>
      </section>

      <section class="space-y-3" aria-labelledby="legal-host">
        <h2 id="legal-host" class="text-primary font-mono text-sm">## {{ t(m.legal.host) }}</h2>
        <template v-for="{ intro, company } in operators" :key="company.name">
          <p class="text-sm text-foreground leading-relaxed">{{ t(intro) }}</p>
          <address class="not-italic font-mono text-xs text-muted-foreground border-l-2 border-primary/40 pl-4 space-y-0.5">
            <span v-for="text in companyLines(company)" :key="text" class="block">{{ text }}</span>
            <a :href="company.url" target="_blank" rel="noopener noreferrer" class="block text-primary hover:underline">{{ company.url }}</a>
          </address>
        </template>
      </section>

      <section id="guestbook" class="space-y-3" aria-labelledby="legal-guestbook">
        <h2 id="legal-guestbook" class="text-primary font-mono text-sm">## {{ t(m.legal.guestbook) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(legalCopy.guestbook) }}</p>
        <p class="text-sm text-foreground leading-relaxed">{{ t(legalCopy.report) }}</p>
      </section>

      <section class="space-y-3" aria-labelledby="legal-property">
        <h2 id="legal-property" class="text-primary font-mono text-sm">## {{ t(m.legal.property) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">
          {{ t(legalCopy.code) }}
          <a :href="`${repo}/blob/master/LICENSE`" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">LICENSE ↗</a>
        </p>
        <p class="text-sm text-foreground leading-relaxed">{{ t(legalCopy.marks) }}</p>
      </section>

      <section class="space-y-3" aria-labelledby="legal-credits">
        <h2 id="legal-credits" class="text-primary font-mono text-sm">## {{ t(m.legal.credits) }}</h2>
        <p class="text-sm text-foreground leading-relaxed">{{ t(legalCopy.credits) }}</p>
        <ul class="space-y-2 font-mono text-xs" data-testid="legal-credits">
          <li
            v-for="credit in credits"
            :key="credit.who"
            class="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,12rem)_1fr_auto] border-l-2 border-border pl-3"
          >
            <span class="text-muted-foreground">{{ t(credit.what) }}</span>
            <a :href="credit.href" target="_blank" rel="noopener noreferrer" class="text-foreground hover:text-primary break-words">{{ credit.who }}</a>
            <a
              v-if="credit.licence"
              :href="credit.licence.href"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
              >{{ credit.licence.name }}</a
            >
          </li>
        </ul>
      </section>

      <p class="text-xs text-muted-foreground">
        <RouterLink to="/privacy" class="text-primary hover:underline">/privacy</RouterLink>
        · <RouterLink to="/now" class="text-primary hover:underline">/now</RouterLink>
        · <RouterLink to="/" class="text-primary hover:underline">~</RouterLink>
      </p>
    </div>
  </main>
</template>
