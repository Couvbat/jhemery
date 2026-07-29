<script setup lang="ts">
import { profile } from '@/content'
import { useLocale } from '@/i18n'

const { t, m } = useLocale()

// Injected by Vite at build time — see vite.config.ts.
const sha = __BUILD_SHA__
const builtAt = __BUILD_TIME__
const repo = 'https://github.com/Couvbat/jhemery'

const builtLabel = new Date(builtAt).toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
</script>

<template>
  <footer class="border-t border-border bg-background/80">
    <div
      class="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground"
    >
      <span class="text-primary">$</span>
      <span>{{ profile.name }} © {{ new Date().getFullYear() }}</span>

      <a
        :href="`${repo}/commit/${sha}`"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-primary transition-colors"
        :title="t(m.footer.source)"
      >
        {{ sha }}
      </a>

      <span class="text-muted-foreground/60">{{ t(m.footer.built) }} {{ builtLabel }}</span>

      <a
        :href="repo"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto hover:text-primary transition-colors"
      >
        {{ t(m.footer.source) }} ↗
      </a>
    </div>
  </footer>
</template>
