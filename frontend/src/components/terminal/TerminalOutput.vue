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

  <!-- Plain output. `pre` keeps ASCII art and padded columns aligned. -->
  <p
    v-else
    :class="[
      toneClass[line.tone ?? 'default'],
      line.pre ? 'whitespace-pre' : 'whitespace-pre-wrap break-words',
    ]"
  >{{ line.text || ' ' }}</p>
</template>
