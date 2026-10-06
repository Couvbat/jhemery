<script setup lang="ts">
import { computed } from 'vue'
import { profile } from '@/content'
import { runLink } from '@/composables/useTerminal'
import { closeTerminal } from '@/composables/useTerminalShell'
import { routeTo } from '@/composables/useViewSwing'
import { linkTarget } from '@/terminal/links'
import type { OutputLine } from '@/terminal/types'

const props = defineProps<{ line: OutputLine }>()

const target = computed(() => (props.line.href ? linkTarget(props.line.href) : null))

/**
 * The site's own links stay in this tab (see `terminal/links.ts`). A modified click —
 * Ctrl, Cmd, Shift, or the middle button — is left to the browser, so "open in a new
 * tab" still works on any of them.
 */
function follow(event: MouseEvent) {
  const to = target.value
  if (!to || to.kind === 'external') return
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (to.kind === 'run') void runLink(to.line)
  else if (to.kind === 'route') {
    if (closeTerminal()) routeTo(to.path)
  } else window.location.assign(to.href)
}

const toneClass: Record<string, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  accent: 'text-accent',
  secondary: 'text-secondary',
  error: 'text-destructive',
  success: 'text-primary',
  warning: 'text-warning',
}
</script>

<template>
  <!-- Echoed command -->
  <p v-if="line.prompt" class="whitespace-pre-wrap break-words">
    <span class="text-primary">{{ profile.handle }}</span
    ><span class="text-muted-foreground">:~$</span>
    <span class="ml-2 text-foreground">{{ line.text }}</span>
  </p>

  <!-- Link output -->
  <p v-else-if="line.href" :class="['break-words', line.pre ? 'whitespace-pre' : 'whitespace-pre-wrap']">
    <a
      :href="line.href"
      :target="target?.kind === 'external' ? '_blank' : undefined"
      :rel="target?.kind === 'external' ? 'noopener noreferrer' : undefined"
      class="text-accent underline underline-offset-2 hover:text-primary transition-colors"
      @click="follow"
      >{{ line.text }}</a
    >
  </p>

  <!-- Per-run tones, for surfaces that need a colour per character rather than
       per line — the game boards, and `theme`'s swatches. Still plain text, just sliced. -->
  <p
    v-else-if="line.segments"
    :class="[
      toneClass[line.tone ?? 'default'],
      line.pre ? 'whitespace-pre' : 'whitespace-pre-wrap break-words',
    ]"
  ><span
      v-for="(segment, i) in line.segments"
      :key="i"
      :class="segment.tone ? toneClass[segment.tone] : undefined"
      :style="segment.colour ? { color: segment.colour } : undefined"
    >{{ segment.text }}</span></p>

  <!-- Plain output. `pre` keeps ASCII art and padded columns aligned. The
       empty-line fallback is a non-breaking space written as an escape: a
       blank line still has to occupy a row, and a literal U+00A0 sitting in
       the source is indistinguishable from a stray typo. -->
  <p
    v-else
    :class="[
      toneClass[line.tone ?? 'default'],
      line.pre ? 'whitespace-pre' : 'whitespace-pre-wrap break-words',
    ]"
  >{{ line.text || '\u00a0' }}</p>
</template>
