<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useLocale } from '@/i18n'
import { copyText } from './clipboard'

const props = defineProps<{ text: string }>()
const { t, m } = useLocale()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  if (!(await copyText(props.text))) return
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
}

onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <button
    type="button"
    class="px-2 py-0.5 text-xs font-mono rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
    :disabled="!text"
    @click="copy"
  >
    {{ copied ? t(m.tools.copied) : t(m.tools.copy) }}
  </button>
</template>
