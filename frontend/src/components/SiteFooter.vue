<script setup lang="ts">
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { useStatus } from '@/composables/useStatus'

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

// Days since the first commit, and how long ago this build went out — the same
// numbers `neofetch` and `top` report inside the terminal, kept visible.
const { uptime, lastDeploy } = useStatus(builtAt)
</script>

<template>
  <footer class="border-t border-border bg-background/80">
    <div class="max-w-5xl mx-auto px-4 py-6 space-y-2">
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground"
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

    <p
      class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground/70"
      :aria-label="t(m.footer.status)"
    >
      <span class="text-primary/70">▸</span>
      <span>uptime {{ uptime }}</span>
      <span class="text-muted-foreground/40" aria-hidden="true">·</span>
      <span>deploy {{ lastDeploy }}</span>
      <span class="text-muted-foreground/40" aria-hidden="true">·</span>
      <span class="inline-flex items-center gap-1.5 text-primary/80">
        <span
          class="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse"
          aria-hidden="true"
        ></span>
        {{ t(m.footer.nominal) }}
      </span>
    </p>
    </div>
  </footer>
</template>
