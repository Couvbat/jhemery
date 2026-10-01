<script lang="ts">
/**
 * The three dots every window's title bar starts with, in tokens: red is `destructive`,
 * amber `warning` and green `primary`, the terminal's own error, warning and success
 * tones. They used to be Tailwind's red, yellow and green in thirteen copies, which no
 * scheme recoloured and which washed out on the light ones. Exported for the terminal's
 * title bar, where the dots are buttons (close, minimise, maximise) and need a hover.
 * Literal class names, so Tailwind's scanner finds them.
 */
export const WINDOW_DOTS = [
  { fill: 'bg-destructive/80', hover: 'hover:bg-destructive' },
  { fill: 'bg-warning/80', hover: 'hover:bg-warning' },
  { fill: 'bg-primary/80', hover: 'hover:bg-primary' },
] as const
</script>

<script setup lang="ts">
const dots = WINDOW_DOTS
</script>

<template>
  <span class="flex items-center gap-2" aria-hidden="true">
    <span v-for="dot in dots" :key="dot.fill" :class="['w-3 h-3 rounded-full', dot.fill]"></span>
  </span>
</template>
