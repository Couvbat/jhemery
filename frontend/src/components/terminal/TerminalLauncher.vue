<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLocale } from '@/i18n'
import { closeTerminal, openTerminal, terminalOpen as open } from '@/composables/useTerminalShell'

const { t, m } = useLocale()

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

function onKeydown(event: KeyboardEvent) {
  // Backtick anywhere outside a form field, or Ctrl+` even inside one.
  const isBacktick = event.key === '`'
  if (!isBacktick) return
  if (!event.ctrlKey && isTypingTarget(event.target)) return

  event.preventDefault()
  if (open.value) closeTerminal()
  else openTerminal()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!--
    At every width. Below md it opens the touch layout, buttons and no input (features-spec
    §9): a fixed input fights a phone's virtual keyboard badly enough that no input beats a
    broken one. 44px tall there, 16px from the edges, and clear of a home indicator where
    the page is laid out under one. The backtick hint is a keyboard's.
  -->
  <button
    v-show="!open"
    class="flex fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-50 min-h-11 md:min-h-0 items-center gap-2 rounded border border-primary/50 bg-background/90 backdrop-blur px-4 py-2.5 font-mono text-sm text-primary border-glow hover:bg-primary/10 hover:border-primary transition-all group"
    :aria-label="t(m.terminal.open)"
    :title="`${t(m.terminal.open)} (\`)`"
    @click="openTerminal()"
  >
    <span class="text-primary">&gt;_</span>
    <span class="group-hover:glow-green transition-all">{{ t(m.terminal.title) }}</span>
    <kbd class="hidden md:inline ml-1 text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5"
      >`</kbd
    >
  </button>
</template>
