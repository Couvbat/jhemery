<script setup lang="ts">
import { computed } from 'vue'
import type { VimBufferState } from '@/terminal/types'

const props = defineProps<{ buffer: VimBufferState }>()

/** Fixed, generous count — the container clips whatever doesn't fit, so this
 *  works at both the normal (60vh) and maximised (85vh) overlay heights without
 *  measuring pixel heights. */
const TILDE_COUNT = 60
const tildeRows = Array.from({ length: TILDE_COUNT })

const statusText = computed(() => {
  const byteCount = props.buffer.lines.join('\n').length
  const modified = props.buffer.dirty ? ' [+]' : ''
  return `"${props.buffer.name}" [readonly]${modified} ${props.buffer.lines.length}L, ${byteCount}B`
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
        v-for="(text, i) in buffer.lines"
        :key="`line-${i}`"
        class="text-foreground whitespace-pre-wrap break-words"
      ><template v-if="i === buffer.cursor.row"
        >{{ text.slice(0, buffer.cursor.col) }}<span
          class="bg-primary text-background"
          >{{ text[buffer.cursor.col] ?? ' ' }}</span
        >{{ text.slice(buffer.cursor.col + 1) }}</template
      ><template v-else>{{ text || ' ' }}</template></p>
      <p v-for="(_, i) in tildeRows" :key="`tilde-${i}`" class="text-muted-foreground">~</p>
    </div>
    <p
      class="px-4 py-1 border-t border-border shrink-0 truncate bg-muted"
      :class="buffer.statusMessage ? 'text-destructive' : 'text-muted-foreground'"
    >{{ buffer.statusMessage ?? statusText }}</p>
  </div>
</template>
