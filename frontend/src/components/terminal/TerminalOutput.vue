<script setup lang="ts">
import { profile } from '@/content'
import type { OutputLine } from '@/terminal/types'

defineProps<{ line: OutputLine }>()

const toneClass: Record<string, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  accent: 'text-accent',
  secondary: 'text-secondary',
  error: 'text-destructive',
  success: 'text-primary',
  warning: 'text-yellow-400',
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
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline underline-offset-2 hover:text-primary transition-colors"
      >{{ line.text }}</a
    >
  </p>

  <!-- Per-run tones, for surfaces that need a colour per character rather than
       per line — the game boards. Still plain text, just sliced. -->
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
