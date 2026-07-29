<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLocale } from '@/i18n'
import { useTerminal } from '@/composables/useTerminal'

const { t, m } = useLocale()
const { open, openTerminal, closeTerminal } = useTerminal()

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
    Desktop only: a fixed input panel fights mobile virtual keyboards badly enough
    that no terminal beats a broken one. The rendered page carries the same content.
  -->
  <button
    v-show="!open"
    class="hidden md:flex fixed bottom-6 right-6 z-50 items-center gap-2 rounded border border-primary/50 bg-background/90 backdrop-blur px-4 py-2.5 font-mono text-sm text-primary border-glow hover:bg-primary/10 hover:border-primary transition-all group"
    :aria-label="t(m.terminal.open)"
    :title="`${t(m.terminal.open)} (\`)`"
    @click="openTerminal()"
  >
    <span class="text-primary">&gt;_</span>
    <span class="group-hover:glow-green transition-all">{{ t(m.terminal.title) }}</span>
    <kbd class="ml-1 text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5"
      >`</kbd
    >
  </button>
</template>
