<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { profile } from '@/content'
import { useLocale } from '@/i18n'
import { openTerminal } from '@/composables/useTerminalShell'

const route = useRoute()
const router = useRouter()
const { t, m } = useLocale()

const attemptedPath = computed(() => route.fullPath)
</script>

<template>
  <main class="min-h-screen flex items-center justify-center px-4 pt-14 scanlines">
    <div class="w-full max-w-2xl">
      <div class="rounded border border-destructive/40 bg-card overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
          <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          <span class="ml-3 text-xs text-muted-foreground"
            >{{ profile.handle }}@{{ profile.host }} ~ bash</span
          >
        </div>

        <div class="p-6 md:p-10 font-mono text-sm space-y-4">
          <p>
            <span class="text-primary">{{ profile.handle }}</span
            ><span class="text-muted-foreground">:~$</span>
            <span class="ml-2 text-foreground">cd {{ attemptedPath }}</span>
          </p>

          <p class="text-destructive break-all">
            bash: cd: {{ attemptedPath }}: No such file or directory
          </p>

          <p class="text-6xl font-bold text-destructive glow-pink">404</p>

          <div class="flex flex-wrap items-center gap-3 pt-2">
            <button
              class="px-4 py-2 rounded border border-primary/50 text-primary hover:bg-primary/10 transition-colors"
              @click="router.push('/')"
            >
              $ {{ t(m.notFound.back) }}
            </button>
            <button
              class="hidden md:inline text-xs text-muted-foreground hover:text-primary transition-colors"
              @click="openTerminal('help')"
            >
              {{ t(m.notFound.hint) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
