<script setup lang="ts">
import { computed } from 'vue'
import type { VimFile } from '@/terminal/types'

const props = defineProps<{ file: VimFile; error: string | null }>()

/** Fixed, generous count — the container clips whatever doesn't fit, so this
 *  works at both the normal (60vh) and maximised (85vh) overlay heights without
 *  measuring pixel heights. */
const TILDE_COUNT = 60
const tildeRows = Array.from({ length: TILDE_COUNT })

const statusText = computed(() => {
  const byteCount = props.file.lines.join('\n').length
  return `"${props.file.name}" [readonly] ${props.file.lines.length}L, ${byteCount}B`
})
</script>

<template>
  <div
    class="flex-1 flex flex-col overflow-hidden font-mono text-xs sm:text-sm"
    aria-live="polite"
    aria-atomic="false"
  >
    <div class="flex-1 overflow-hidden p-4">
      <p
        v-for="(text, i) in file.lines"
        :key="`line-${i}`"
        class="text-foreground whitespace-pre-wrap break-words"
      >{{ text || ' ' }}</p>
      <p v-for="(_, i) in tildeRows" :key="`tilde-${i}`" class="text-muted-foreground">~</p>
    </div>
    <p
      :class="[
        'px-4 py-1 border-t border-border shrink-0 truncate',
        error ? 'text-destructive bg-destructive/10' : 'text-muted-foreground bg-muted',
      ]"
    >{{ error ?? statusText }}</p>
  </div>
</template>
