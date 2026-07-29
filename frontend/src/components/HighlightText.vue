<script setup lang="ts">
import { computed } from 'vue'

/**
 * Renders `text` with any occurrence of `terms` wrapped in a highlight class.
 * Splits into text nodes rather than using `v-html` — the content is ours, but
 * the same component is reused for user-supplied guestbook entries.
 */
const props = withDefaults(
  defineProps<{
    text: string
    terms: string[]
    highlightClass?: string
  }>(),
  { highlightClass: 'text-primary font-semibold' },
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const parts = computed(() => {
  const terms = props.terms.filter(Boolean)
  if (!terms.length) return [{ text: props.text, match: false }]

  // Longest first so "Jules Hémery" wins over a bare "Jules".
  const pattern = new RegExp(
    `(${[...terms].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`,
    'g',
  )

  return props.text
    .split(pattern)
    .filter((chunk) => chunk !== '')
    .map((chunk) => ({ text: chunk, match: terms.includes(chunk) }))
})
</script>

<template>
  <span
    ><template v-for="(part, i) in parts" :key="i"
      ><span v-if="part.match" :class="highlightClass">{{ part.text }}</span
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>
