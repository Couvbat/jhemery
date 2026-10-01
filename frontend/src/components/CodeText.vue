<script setup lang="ts">
import { computed } from 'vue'
import { codeSpans } from '@/lib/codeSpans'

const props = defineProps<{ text: string }>()
const spans = computed(() => codeSpans(props.text))
</script>

<!-- One line on purpose: whitespace between the spans would show as spaces inside a word. -->
<template>
  <template v-for="(span, i) in spans" :key="i"><code v-if="span.code" class="rounded-sm bg-muted px-1 text-foreground">{{ span.text }}</code><template v-else>{{ span.text }}</template></template>
</template>
