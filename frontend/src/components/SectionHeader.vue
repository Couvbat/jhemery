<script setup lang="ts">
import { computed } from 'vue'
import { findSection, profile } from '@/content'
import { useLocale } from '@/i18n'

const props = withDefaults(
  defineProps<{
    section: string
    tone?: 'green' | 'cyan' | 'purple'
  }>(),
  { tone: 'green' },
)

const { t } = useLocale()

const meta = computed(() => findSection(props.section))

const toneClasses = {
  green: { glow: 'glow-green', text: 'text-foreground', hash: 'text-primary' },
  cyan: { glow: 'glow-cyan', text: 'text-accent', hash: 'text-accent' },
  purple: { glow: 'glow-purple', text: 'text-secondary', hash: 'text-secondary' },
} as const

const tone = computed(() => toneClasses[props.tone])
</script>

<template>
  <div v-if="meta" class="mb-10">
    <p class="text-muted-foreground text-sm mb-1">
      <span class="text-primary">{{ profile.handle }}</span
      ><span class="text-muted-foreground">:~$</span>
      <span class="ml-2 text-foreground">{{ meta.prompt }}</span>
    </p>
    <h2 :class="['text-2xl md:text-3xl font-bold', tone.glow, tone.text]">
      <span :class="tone.hash">#</span> {{ t(meta.heading) }}
    </h2>
  </div>
</template>
